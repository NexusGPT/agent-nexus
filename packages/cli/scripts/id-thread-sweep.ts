#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveIdGraph } from "../src/id-graph";
import { idsFrom } from "../src/id-graph.ids";
import { outcomeForExitCode } from "../src/id-graph.outcome";

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
 * THE FOUR OUTCOMES ARE NOT THREE, AND THE SPLIT IS THE WHOLE POINT
 * ==============================================================================
 *
 *   REACHED        invoked, exit 0, parseable JSON, no credential in the body.
 *   SKIPPED_NO_ID  its producer returned ZERO rows, so no id existed to pass.
 *                  The route is UNTESTED and nothing is claimed about it.
 *   SKIPPED_NEEDS_INPUT
 *                  the CLI refused BEFORE SENDING ANYTHING, which is a fact
 *                  about what this harness supplied and not about the route.
 *                  A 400/409/422 shares its exit code and is NOT this - see
 *                  `isClientSideRefusal`.
 *   FAILED         invoked, and something was wrong. A producer that ERRORED
 *                  lands here too, never in SKIPPED.
 *   REFUSED        the run could not establish its own preconditions, so it
 *                  reports no per-leaf verdicts at all.
 *
 * Exit codes: 0 all reached · 1 at least one FAILED · 4 preflight refusal ·
 * 5 empty population · 7 nothing reached. The status names the KIND of outcome;
 * the COUNT is in the output and never in the status.
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

type Status = "REACHED" | "SKIPPED_NO_ID" | "SKIPPED_NEEDS_INPUT" | "FAILED";
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

  // -- Discovery. Each producer runs ONCE however many consumers it feeds. ----
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
  const results: Result[] = [];
  for (const leaf of graph.executable) {
    const args: string[] = [];
    // Carried as a STATUS, never inferred later from the note's wording.
    let blocked: { status: Status; note: string } | undefined;

    for (const source of leaf.sources) {
      if (source.kind !== "producer-leaf") continue;

      const broke = producerBroke.get(source.leaf);
      if (broke !== undefined) {
        blocked = { status: "FAILED", note: `producer \`${source.leaf}\` failed: ${broke}` };
        break;
      }
      const ids = idsFrom(bodyOf.get(source.leaf) ?? "", source.param);
      if (ids.length === 0) {
        blocked = {
          status: "SKIPPED_NO_ID",
          note: `no \`${source.param}\` existed - producer \`${source.leaf}\` returned zero rows`
        };
        break;
      }
      args.push(ids[0]);
    }

    if (blocked !== undefined) {
      results.push({ status: blocked.status, path: leaf.path, note: blocked.note });
      continue;
    }

    const res = run([...leaf.path.split(" "), ...args, "--json"]);
    if (res.code !== 0) {
      results.push(fromExitCode(leaf.path, res.code, res.out));
      continue;
    }
    results.push(fromScan(leaf.path, scan(res.out), args.length));
  }

  const countOf = (status: Status): number =>
    results.filter((result) => result.status === status).length;
  const reached = countOf("REACHED");
  const skippedNoId = countOf("SKIPPED_NO_ID");
  const skippedNeedsInput = countOf("SKIPPED_NEEDS_INPUT");
  const skipped = skippedNoId + skippedNeedsInput;
  const failed = countOf("FAILED");

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
            skippedNeedsInput,
            failed,
            total: results.length
          },
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
    // Both skip kinds named. One total would hide which of two very different
    // things happened: nothing existed to test with, or the call was malformed.
    process.stdout.write(
      `\nSummary: ${reached} reached · ${skipped} skipped ` +
        `(${skippedNoId} no-id, ${skippedNeedsInput} needs-input) · ${failed} failed\n`
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

  // Zero reached is a refusal even with zero failures. See the header.
  if (reached === 0) {
    process.stderr.write(
      `REFUSED: ${results.length} leaves considered and NONE was reached ` +
        `(${skipped} skipped, ${failed} failed). A run that exercised nothing is not a pass.\n`
    );
    process.exit(EXIT_NOTHING_REACHED);
  }
  // WHICH KIND, never HOW MANY. See the exit-code block at the top of this file.
  process.exit(failed > 0 ? EXIT_FAILURES : 0);
}

main();
