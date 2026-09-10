#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveIdGraph } from "../src/id-graph";
import { rowsFrom } from "../src/id-graph.ids";
import type { ThreadableLeaf } from "../src/id-graph.model";
import { type LeafOutcome, outcomeForExitCode } from "../src/id-graph.outcome";
import { isNotFound, raceVerdict, type ThreadedId } from "../src/id-graph.race";
import { planThread } from "../src/id-graph.thread";

/**
 * id-thread-sweep - execute the read leaves that need an id, with ids DISCOVERED
 * rather than written down.
 *
 * ==============================================================================
 * WHAT IT ADDS TO `sweep.sh`
 * ==============================================================================
 *
 * `sweep.sh` runs the leaves that take no input. This runs the ones that take an
 * id, by first running the leaf that PRODUCES that id. The dependency is derived
 * from the route tree in `src/id-graph.ts` - nothing here knows that an agent id
 * comes from `agent list`, and no table anywhere says so.
 *
 * ==============================================================================
 * THE OUTCOMES ARE NOT THREE, AND THE SPLIT IS THE WHOLE POINT
 * ==============================================================================
 *
 *   REACHED        invoked, exit 0, parseable JSON, no credential in the body.
 *   SKIPPED_NO_ID  its producer returned ZERO rows, so no id existed to pass.
 *                  The route is UNTESTED and nothing is claimed about it.
 *   SKIPPED_ID_VANISHED
 *                  every id its producer offered was PROVEN deleted between the
 *                  list call and the read - a concurrent writer, not a broken
 *                  route. Also untested, and for a different reason, so it is
 *                  counted separately. See `src/id-graph.race.ts`.
 *   SKIPPED_NEEDS_INPUT
 *                  the CLI refused BEFORE SENDING ANYTHING, which is a fact
 *                  about what this harness supplied and not about the route.
 *                  A 400/409/422 shares its exit code and is NOT this - see
 *                  `isClientSideRefusal`.
 *   FAILED         invoked, and something was wrong. A producer that ERRORED
 *                  lands here too, never in SKIPPED. A `not-found` whose row is
 *                  still listed by its own producer lands here as well, which is
 *                  the signal this whole sweep exists to produce.
 *   REFUSED        the run could not establish its own preconditions, so it
 *                  reports no per-leaf verdicts at all.
 *
 * Exit codes: 0 at or above the provisioned floor with nothing failing ·
 * 1 at least one FAILED · 4 preflight refusal · 5 empty population ·
 * 7 nothing reached · 8 below the provisioned floor. The status names the KIND
 * of outcome; the COUNT is in the output and never in the status.
 *
 * "No agent existed to test with" and "the route is broken" are opposite facts,
 * and a harness that renders both as a non-green is not a control. Worse in the
 * other direction: one that renders SKIPPED as PASS reports coverage it never
 * had. So SKIPPED_NO_ID is counted separately and printed with the producer that
 * came back empty - and, the part that matters:
 *
 * A RUN THAT REACHED NOTHING EXITS NON-ZERO EVEN WITH ZERO FAILURES.
 * An all-skipped run is the failure mode this harness exists to prevent, and
 * shipping one inside the fix for it would be the joke writing itself.
 * See {@link EXIT_NOTHING_REACHED}.
 *
 * AND A RUN THAT REACHED ONE LEAF IS THE SAME FAILURE MODE WITH A NUMERATOR.
 * Every count above is on STDOUT, and the thing branch protection and a reviewer
 * read is the STATUS. So a floor sits beside the disclosure rather than replacing
 * it: a run whose PROVISIONED population - the leaves whose id-producer returned
 * at least one row - falls under {@link PROVISIONED_FLOOR} exits non-zero with a
 * code of its own. See {@link EXIT_BELOW_FLOOR}.
 *
 * -- READ-ONLY, PROVEN RATHER THAN INTENDED ----------------------------------
 *
 * Every leaf here is `GET` according to the Public API v1 contract binding, and
 * `id-graph.ts` admits nothing else. This runner never builds a command from a
 * verb name and has no allowlist. It passes `--json` and the discovered ids and
 * nothing else, so no flag it invents can turn a read into a write.
 *
 * -- USAGE -------------------------------------------------------------------
 *
 *   tsx scripts/id-thread-sweep.ts --plan     # derive and print, no network
 *   tsx scripts/id-thread-sweep.ts            # run it
 *   tsx scripts/id-thread-sweep.ts --json     # machine-readable
 *   NEXUS_BIN="node dist/index.js" tsx scripts/id-thread-sweep.ts --profile ci
 */

/**
 * THE EXIT CODES ARE A VOCABULARY, AND NO TWO OF THEM MAY MEAN TWO THINGS.
 *
 * This ran as `process.exit(failed)` first - the FAILURE COUNT as the status.
 * That destroyed the one property this whole harness exists to have: four
 * failing leaves exited 4, which is the preflight refusal, and seven exited 7,
 * which is "nothing was reached". A broken-route run and an empty-id-source run
 * became indistinguishable at exactly the point where telling them apart is the
 * entire deliverable. The header below already named the reserved codes while
 * the code contradicted them.
 *
 * So the status says WHICH KIND of outcome, never HOW MANY. The count is in the
 * output, where a number belongs.
 */
/** At least one leaf was invoked and was wrong. The count is in the report. */
const EXIT_FAILURES = 1;
/** No binary, or not authenticated. Nothing below ran. */
const EXIT_PREFLIGHT = 4;
/** The derivation produced no executable leaves - a broken graph, not a clean tree. */
const EXIT_EMPTY_POPULATION = 5;
/** Leaves were considered and NONE was reached. Never a pass, even with 0 failures. */
const EXIT_NOTHING_REACHED = 7;
/**
 * Something was reached and nothing failed, and still too little of the
 * population had an id to test with. See {@link PROVISIONED_FLOOR}.
 *
 * It is its OWN number rather than a reuse of 7. Both mean "this run is not
 * coverage", and they mean it about different worlds: 7 is a total outage,
 * where every producer came back empty and no route was touched at all, and 8
 * is a run that genuinely exercised part of the tree. Spending one number on
 * both would be the failure this file's own exit-code block was written about,
 * arriving through the fix for a different one.
 */
const EXIT_BELOW_FLOOR = 8;

/**
 * THE LEAST OF THIS HARNESS'S POPULATION THAT MUST HAVE HAD AN ID TO TEST WITH.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE FLOOR IS ON `provisioned`, NEVER ON `reached`, AND THAT IS THE DESIGN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `provisioned` is `executable - SKIPPED_NO_ID`: the leaves whose id-producer
 * came back with at least one row, whatever became of them afterwards. It is
 * the population that SURVIVES every cure, which is the only kind of population
 * a floor may sit on. `packages/types/src/testing/shrink-only-ledger.ts` states
 * the same rule for the same reason, over its own `floor`.
 *
 *   - Seeding a fixture RAISES it. The repair moves the number the right way.
 *   - Fixing a broken route leaves it FLAT. A cured leaf always had an id.
 *   - The concurrent-delete race CANNOT MOVE IT. A `SKIPPED_ID_VANISHED` row
 *     had a fixture - it was listed, and a concurrent writer deleted it between
 *     the list call and the read - so it is provisioned and stays provisioned.
 *     That race is live rather than theoretical: {@link NOT_FOUND_REATTEMPTS}
 *     bounds it and does not remove it.
 *
 * A floor on `reached` goes red on all three, and calls each of them a coverage
 * outage. It is the same threshold on the wrong noun.
 *
 * 🚨 A CHECKED-IN LITERAL, NEVER `graph.executable.length` MINUS ANYTHING AT
 * RUNTIME. A floor derived from the population it bounds bounds itself: every
 * leaf could lose its fixture and the comparison would still hold, silently and
 * forever. `src/id-graph.ledger.test.ts` carries the same warning verbatim over
 * its own `ceiling`.
 *
 * debt: floor 10, below the 14 provisioned last measured live on 2026-09-01,
 *       because no PR-time run can observe staging to confirm 14.
 *       Upgrade trigger: the first green promotion run prints `provisioned=N` -
 *       raise this literal to that N.
 *
 * What 10 buys, against that measurement: the 14 come from nine producers, the
 * largest of which feeds 3 leaves, so no single producer going empty can cross
 * it and it takes at least two to. It catches a multi-namespace fixture outage
 * and deliberately does not catch a single-leaf one.
 */
const PROVISIONED_FLOOR = 10;

/**
 * The vocabulary is declared ONCE, in `src/id-graph.outcome.ts`, and this file
 * reads it. It was duplicated here as a local union, so adding an outcome meant
 * editing two closed unions that nothing compared — and the one this file
 * carried would have been the one a report is printed from.
 */
type Status = LeafOutcome;
interface Result {
  readonly status: Status;
  readonly path: string;
  readonly note: string;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const hasFlag = (name: string): boolean => argv.includes(name);
const flagValue = (name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const PROFILE = flagValue("--profile");
const AS_JSON = hasFlag("--json");
const PLAN_ONLY = hasFlag("--plan");

const NEXUS_CMD = (process.env.NEXUS_BIN ?? "nexus").split(/\s+/);
const GLOBAL_ARGS = PROFILE ? ["--profile", PROFILE] : [];

function run(args: readonly string[]): { code: number; out: string } {
  const proc = spawnSync(NEXUS_CMD[0], [...NEXUS_CMD.slice(1), ...GLOBAL_ARGS, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  return { code: proc.status ?? 1, out: `${proc.stdout ?? ""}${proc.stderr ?? ""}` };
}

function refuse(code: number, lines: readonly string[]): never {
  for (const line of lines) process.stderr.write(`${line}\n`);
  process.exit(code);
}

/** One pass of the same secret scanner `sweep.sh` uses. Never prints a value. */
function scan(bodyText: string): { code: number; out: string } {
  const proc = spawnSync("python3", [join(SCRIPT_DIR, "scan-response.py")], {
    input: bodyText,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  return { code: proc.status ?? 1, out: (proc.stdout ?? "").trim() };
}

/**
 * The verdict for a non-zero exit, from `src/id-graph.outcome.ts`.
 *
 * The mapping lives there rather than here because this file ends in `main()`:
 * importing it RUNS the sweep, so nothing in the suite could ever reach the
 * contract while it lived inline. See that module's header.
 */
function fromExitCode(path: string, code: number, out: string): Result {
  const verdict = outcomeForExitCode(code, out);
  return { status: verdict.status, path, note: verdict.note };
}

/** Turn one scanner verdict into a result. Split out so every arm is visible at once. */
function fromScan(path: string, scanned: { code: number; out: string }, threaded: number): Result {
  if (scanned.code === 0)
    return { status: "REACHED", path, note: `json ok, ${threaded} id(s) threaded` };
  if (scanned.code === 2) {
    return { status: "FAILED", path, note: `SECRET-SHAPED RESPONSE: ${scanned.out.slice(0, 100)}` };
  }
  if (scanned.code === 1 && scanned.out === "NOT-JSON") {
    return { status: "FAILED", path, note: "exit=0 but the response is not JSON" };
  }
  // Neither read nor cleared. Quote NOTHING: an unscanned body may carry a credential.
  return { status: "FAILED", path, note: `SECRET SCAN UNMEASURED: scanner exited ${scanned.code}` };
}

/**
 * WHAT THIS RUN DID NOT REACH, AND WHAT FRACTION OF ITS REACH THAT IS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A SKIP IS HONEST AND STILL COSTS COVERAGE. THIS IS THE PRICE TAG.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `SKIPPED_NO_ID` says truthfully that nothing existed to test with, and a
 * reader who sees ten of them scrolls past. The number that changes a decision
 * is the SHARE: on the first live run, ten of twenty-six executable leaves were
 * the `tracks` namespace, inert because staging held no tracks - 38% of this
 * harness's whole reach, silently.
 *
 * So the arithmetic is printed rather than left to be rediscovered. It is
 * DERIVED on every run, never written down: a figure in a comment would be
 * wrong the day someone seeds a fixture or lands a command, and would still read
 * as measured.
 *
 * Seeding is deliberately NOT done here. This job authenticates with a
 * READ-ONLY key so a gate cannot mutate the environment it measures, and
 * `scripts/seed-sweep-fixtures.sh` is the write-scoped tool for it, run by hand.
 * This function's job is to make the case for that, not to make the writes.
 */
function inertNamespaces(results: readonly Result[], executable: number): string[] {
  const byNamespace = new Map<string, number>();
  for (const result of results) {
    if (result.status !== "SKIPPED_NO_ID") continue;
    const namespace = result.path.split(" ")[0];
    byNamespace.set(namespace, (byNamespace.get(namespace) ?? 0) + 1);
  }
  if (byNamespace.size === 0 || executable === 0) return [];

  return [...byNamespace.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([namespace, count]) => {
      const share = Math.round((count / executable) * 100);
      const noun = count === 1 ? "leaf" : "leaves";
      return `  ${String(count).padStart(3)} ${noun} in \`${namespace}\` unexercised - ${share}% of this harness's reach`;
    });
}

/**
 * HOW MANY TIMES A LEAF IS RE-THREADED AFTER A ROW IS *PROVEN* DELETED.
 *
 * Not a tolerance and not a backoff: each re-thread happens only once the fresh
 * producer read has SHOWN the previous id gone, so a bounded number of them
 * costs nothing on a healthy run and never softens a real not-found. Two is the
 * observed shape with room to spare — the measured races deleted ONE row per
 * sweep window, and exhausting this means three different rows were deleted
 * underneath one leaf, which is reported as its own outcome rather than guessed.
 */
const NOT_FOUND_REATTEMPTS = 2;

/**
 * Re-read every producer that fed this attempt.
 *
 * A successful re-read REPLACES the stored body, so every later leaf threads the
 * surviving rows instead of walking into the same deleted one. A failed re-read
 * is recorded as `undefined` and leaves the stored body alone — it is evidence
 * of nothing, and `raceVerdict` treats it as `unmeasured`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 "SUCCESSFUL" MEANS **PARSED AS A LIST**, NEVER MERELY EXIT 0
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A route that answers 200 with an error page exits 0 and carries no rows, and
 * `idsFrom` reads it as zero ids. Gating this write on the exit code alone lets
 * such a body REPLACE a good stored list.
 *
 * 🔴 AND `bodyOf` IS SHARED, so the damage is not confined to the leaf that
 * triggered the re-read: every LATER leaf threading that producer then reports
 * `SKIPPED_NO_ID` — "returned zero rows" — about a producer whose good list this
 * run already held. That is the same substitution this harness exists to refuse,
 * arriving through the cure rather than the disease.
 *
 * `rowsFrom` is the one place the envelope rule lives, and it separates the two
 * facts `idsFrom` deliberately collapses: `undefined` is "did not parse", an
 * empty array is "parsed, and empty". Only the second is a re-read that measured
 * anything. An unreadable one is evidence of nothing — exactly like a failed
 * one — so it records `undefined` and leaves the stored body alone, which leaves
 * the not-found standing as a FAILURE rather than softening it into a race.
 */
function refreshProducers(
  threaded: readonly ThreadedId[],
  bodyOf: Map<string, string>
): Map<string, string | undefined> {
  const refreshed = new Map<string, string | undefined>();
  for (const entry of threaded) {
    if (refreshed.has(entry.producer)) continue;
    const res = run([...entry.producer.split(" "), "--json"]);
    if (res.code === 0 && rowsFrom(res.out) !== undefined) {
      bodyOf.set(entry.producer, res.out);
      refreshed.set(entry.producer, res.out);
    } else {
      refreshed.set(entry.producer, undefined);
    }
  }
  return refreshed;
}

/**
 * One leaf, invoked - and re-invoked when, and only when, a row it threaded is
 * proven to have been deleted underneath it. `id-graph.race.ts` holds the whole
 * argument for why that proof is required and why its default is FAILED.
 */
function runLeaf(
  leaf: ThreadableLeaf,
  bodyOf: Map<string, string>,
  producerBroke: ReadonlyMap<string, string>,
  vanished: Map<string, Set<string>>
): Result {
  let proven = 0;

  for (let attempt = 0; attempt <= NOT_FOUND_REATTEMPTS; attempt += 1) {
    const plan = planThread(leaf, bodyOf, producerBroke, vanished);
    if (plan.kind === "blocked") {
      return { status: plan.status, path: leaf.path, note: plan.note };
    }

    const res = run([...leaf.path.split(" "), ...plan.args, "--json"]);
    if (res.code === 0) return fromScan(leaf.path, scan(res.out), plan.args.length);
    if (!isNotFound(res.code)) return fromExitCode(leaf.path, res.code, res.out);

    // A not-found, which is the ONE code that could mean the row is gone. Ask
    // the producer; never infer it from the code alone.
    const verdict = raceVerdict(plan.threaded, refreshProducers(plan.threaded, bodyOf));
    if (verdict.kind !== "vanished") {
      const base = fromExitCode(leaf.path, res.code, res.out);
      // 🚨 PREFIXED, NEVER APPENDED. `base.note` ends in a 120-char slice of the
      // error DOCUMENT, which `emitDocument` pretty-prints, so it carries
      // newlines and the report's aligned row ends at its first one. A suffix
      // lands several lines down among stream noise - measured - and the reader
      // scanning the FAILED rows never sees which of the two reds this is.
      const why =
        verdict.kind === "still-listed"
          ? "the id is STILL listed by its producer, so this is the route"
          : `race re-check UNMEASURED (${verdict.why})`;
      return { ...base, note: `[${why}] ${base.note}` };
    }
    for (const entry of verdict.gone) {
      let forProducer = vanished.get(entry.producer);
      if (forProducer === undefined) {
        forProducer = new Set<string>();
        vanished.set(entry.producer, forProducer);
      }
      if (!forProducer.has(entry.id)) proven += 1;
      forProducer.add(entry.id);
    }
  }

  return {
    status: "SKIPPED_ID_VANISHED",
    path: leaf.path,
    note:
      `${proven} id(s) were each PROVEN deleted between this run's list call and ` +
      `its read; the route was never exercised and nothing is claimed about it`
  };
}

function main(): void {
  const graph = deriveIdGraph();

  if (PLAN_ONLY) {
    process.stdout.write(`${JSON.stringify(graph, null, 2)}\n`);
    return;
  }

  // An empty population is a broken derivation, never a clean tree. Same
  // discipline `sweep.sh` applies to its own leaf list: an unknown population
  // must never degrade into an empty one, because an empty run passes.
  if (graph.executable.length === 0) {
    refuse(EXIT_EMPTY_POPULATION, [
      "REFUSED: the id graph derived ZERO executable leaves.",
      "That is a broken derivation, not a clean tree. Refusing to report a pass over nothing.",
      `  leaves=${graph.totalLeaves} needsAnId=${graph.needsAnId} threadable=${graph.threadable.length}`
    ]);
  }

  const version = run(["--version"]);
  if (version.code !== 0 || version.out.trim() === "") {
    refuse(EXIT_PREFLIGHT, ["REFUSED: nexus binary unavailable.", version.out.trim()]);
  }
  const auth = run(["auth", "status"]);
  if (auth.code !== 0) {
    refuse(EXIT_PREFLIGHT, [
      "REFUSED: not authenticated, so nothing below would be evidence about the API.",
      auth.out.trim()
    ]);
  }

  // -- Discovery. Each producer runs ONCE here, however many consumers it feeds.
  // It is re-read later only when a consumer answers `not-found` and the harness
  // has to establish whether the row is gone. See `runLeaf`. ------------------
  const producers = new Set<string>();
  for (const leaf of graph.executable) {
    for (const source of leaf.sources)
      if (source.kind === "producer-leaf") producers.add(source.leaf);
  }

  // The BODY is kept rather than a pre-extracted id list: which field to read
  // depends on the consuming param, and one producer can feed params of
  // different names.
  const bodyOf = new Map<string, string>();
  const producerBroke = new Map<string, string>();
  for (const producer of [...producers].sort()) {
    const res = run([...producer.split(" "), "--json"]);
    if (res.code !== 0) {
      // A producer that ERRORED is not a producer that is EMPTY. Conflating them
      // would report a broken list route as "nothing to test with", which is the
      // exact substitution this harness exists to refuse.
      producerBroke.set(producer, res.out.trim().slice(0, 120));
      continue;
    }
    bodyOf.set(producer, res.out);
  }

  // -- Threading -------------------------------------------------------------
  // 🚨 RUN-SCOPED, NOT PER-LEAF, AND KEYED BY PRODUCER. "Producer X lost row Y"
  // is a fact about this RUN — one producer typically feeds several consumers
  // (three leaves take `agentId`), so a per-leaf record makes every consumer
  // after the first re-derive an empty producer as SKIPPED_NO_ID and hides the
  // race behind the ordinary skip. It also means a proven deletion costs ONE
  // 404 rather than one per consumer: the later leaves never issue a call they
  // already know the answer to.
  const vanished = new Map<string, Set<string>>();
  const results: Result[] = [];
  for (const leaf of graph.executable) {
    results.push(runLeaf(leaf, bodyOf, producerBroke, vanished));
  }

  const countOf = (status: Status): number =>
    results.filter((result) => result.status === status).length;
  const reached = countOf("REACHED");
  const skippedNoId = countOf("SKIPPED_NO_ID");
  const skippedIdVanished = countOf("SKIPPED_ID_VANISHED");
  const skippedNeedsInput = countOf("SKIPPED_NEEDS_INPUT");
  const skipped = skippedNoId + skippedIdVanished + skippedNeedsInput;
  const failed = countOf("FAILED");
  // The leaves whose id-producer returned at least one row. `SKIPPED_NO_ID` is
  // the ONLY outcome that means no id existed, so it is the only subtraction —
  // a vanished row, a needs-input refusal and a failure all had one. See
  // PROVISIONED_FLOOR for why this is the population the floor sits on.
  const provisioned = graph.executable.length - skippedNoId;

  if (AS_JSON) {
    process.stdout.write(
      `${JSON.stringify(
        {
          population: {
            totalLeaves: graph.totalLeaves,
            needsAnId: graph.needsAnId,
            threadable: graph.threadable.length,
            executable: graph.executable.length,
            excluded: graph.excluded.length
          },
          counts: {
            reached,
            skipped,
            skippedNoId,
            skippedIdVanished,
            skippedNeedsInput,
            failed,
            // ADDED, never renamed over an existing key: this shape is a
            // contract even though nothing consumes it today, and the next
            // reader ratchets PROVISIONED_FLOOR off this number.
            provisioned,
            total: results.length
          },
          floor: { provisioned: PROVISIONED_FLOOR },
          results
        },
        null,
        2
      )}\n`
    );
  } else {
    // Both numbers, always. `threadable` is the proven-GET population and
    // `executable` is the subset whose ids can actually be produced; printing
    // one under the other's name is exactly the kind of quiet substitution this
    // harness exists to refuse.
    process.stdout.write(
      `id-thread · ${graph.totalLeaves} leaves · ${graph.needsAnId} need an id · ` +
        `${graph.threadable.length} threadable · ${graph.executable.length} executable · ` +
        `${graph.excluded.length} excluded\n\n`
    );
    for (const result of results) {
      process.stdout.write(
        `${result.status.padEnd(14)} ${result.path.padEnd(30)} ${result.note}\n`
      );
    }
    // EVERY skip kind named. One total would hide which of three very different
    // things happened: nothing existed to test with, the row was deleted out
    // from under the call, or the call was malformed.
    process.stdout.write(
      `\nSummary: ${reached} reached · ${skipped} skipped ` +
        `(${skippedNoId} no-id, ${skippedIdVanished} vanished, ${skippedNeedsInput} needs-input) · ` +
        `${failed} failed\n`
    );
    // 🚨 ITS OWN LINE, BESIDE THE SUMMARY AND NEVER INSIDE IT. The `Summary:`
    // line is parsed by a regex in `test/id-thread/id-thread-sweep.test.ts`, and
    // every case there reads it — a new field inside it throws
    // `no summary line in:` from the PARSER, which reads as this runner having
    // broken. It is also a different question: the summary counts OUTCOMES, and
    // this is how much of the population could be tested at all.
    process.stdout.write(
      `provisioned=${provisioned} of ${graph.executable.length} executable ` +
        `(floor ${PROVISIONED_FLOOR}) - leaves whose id-producer returned at least one row\n`
    );

    const inert = inertNamespaces(results, graph.executable.length);
    if (inert.length > 0) {
      process.stdout.write(
        `\nNOTHING EXISTED TO TEST WITH - these routes are unexercised, not proven healthy:\n` +
          `${inert.join("\n")}\n` +
          `Seed with scripts/seed-sweep-fixtures.sh (write-scoped key, by hand). This job's key is read-only.\n`
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE EXIT LADDER. WHICH KIND, never HOW MANY — see the exit-code block at
  // the top of this file. The ORDER is a decision, and each rung states its own.
  // ══════════════════════════════════════════════════════════════════════════

  // 7 FIRST. A run that reached nothing is also, necessarily, below the floor —
  // and it keeps its own reserved code, because "every producer came back empty
  // and no route was touched" is a different world from "part of the tree was
  // exercised and it was too little". 7 is already published for the first.
  if (reached === 0) {
    process.stderr.write(
      `REFUSED: ${results.length} leaves considered and NONE was reached ` +
        `(${skipped} skipped, ${failed} failed). A run that exercised nothing is not a pass.\n`
    );
    process.exit(EXIT_NOTHING_REACHED);
  }

  // 🚨 1 SECOND, AND AHEAD OF THE FLOOR. A FAILED leaf is a positive finding
  // about a ROUTE; the floor is a statement about the ENVIRONMENT. The floor's
  // entire marginal value is stopping a run that would OTHERWISE REPORT A PASS
  // — on a run already exiting non-zero it adds nothing at all, while putting
  // it first would overwrite the one signal a reader acts on, replacing "a
  // route is broken, fix it" with "seed more fixtures". Nothing is lost by
  // deferring: fix the route, re-run, and the floor still bites.
  //
  // The failing leaves are named on stdout either way — and stdout is precisely
  // what the exit code exists because nobody reads.
  if (failed > 0) process.exit(EXIT_FAILURES);

  // 8 LAST, on the only runs where it changes an answer: the ones that would
  // otherwise be green.
  if (provisioned < PROVISIONED_FLOOR) {
    process.stderr.write(
      `REFUSED: BELOW THE PROVISIONED FLOOR - ${provisioned} of ` +
        `${graph.executable.length} executable leaves had an id to test with, ` +
        `and the floor is ${PROVISIONED_FLOOR}.\n` +
        `${reached} leaf/leaves answered correctly and nothing failed, so this is a ` +
        `COVERAGE outage rather than a broken route.\n` +
        `Seed with scripts/seed-sweep-fixtures.sh (write-scoped key). This job's key is read-only.\n`
    );
    process.exit(EXIT_BELOW_FLOOR);
  }

  process.exit(0);
}

main();
