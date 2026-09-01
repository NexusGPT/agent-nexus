#!/usr/bin/env node
/**
 * A FAKE `nexus` BINARY, so the harness's REPORTING can be proven against worlds
 * that cannot be produced against live staging.
 *
 * ==============================================================================
 * WHY A FAKE RATHER THAN THE REAL API
 * ==============================================================================
 *
 * Three of the states `id-thread-sweep.ts` must distinguish cannot be reached
 * honestly against staging:
 *
 *   - "the id source is empty" would mean DELETING every agent in a shared
 *     organisation. The sweep's own key is read-only precisely so a gate cannot
 *     mutate the environment it measures, and this harness inherits that.
 *   - "a route returns the wrong shape" would mean breaking a live route.
 *   - "the API is unreachable" is an outage nobody can schedule.
 *
 * Every one of those is exactly where a harness lies - the empty one especially,
 * because it is the state that reads as a pass. So they are produced here, where
 * they are deterministic and re-runnable, through the SAME `NEXUS_BIN` seam that
 * CI already uses to point the sweep at a freshly built artifact.
 *
 * This proves the REPORTING, which is the deliverable. It does not prove the API
 * behaves - `sweep.sh` and the real `id-thread-sweep` run do that.
 *
 * Runs under `node` directly - Node 24 strips the types natively, so the fixture
 * needs no build step and no tsx in the spawn path.
 *
 * Mode comes from FAKE_MODE:
 *   normal       producers return rows, consumers answer with valid JSON
 *   empty        producers return zero rows -> every consumer must SKIP
 *   badshape     one consumer answers exit 0 with non-JSON -> must FAIL
 *   unreachable  auth fails -> the run must REFUSE, not report greens
 *
 * FAKE_FAIL_LEAVES is separate from FAKE_MODE and composes with it: a
 * comma-separated list of leaf paths that answer exit 0 with non-JSON, for
 * producing a run with a chosen number of FAILURES. See the block that reads it
 * for why there is no count-based knob beside it.
 *
 * FAKE_VANISH_PRODUCERS (+ FAKE_STATE_DIR) is the CONCURRENT DELETE: a named
 * producer's first row is published once and gone from every later read, and any
 * consumer handed it answers `not-found`. That is the fourth state staging
 * cannot be asked for - it needs another job to delete a row inside a window
 * nobody controls. See the block that reads it.
 *
 * FAKE_UNREADABLE_REREAD (+ FAKE_STATE_DIR) is the fifth: a producer whose first
 * read is a good list and whose every later read answers EXIT 0 with a body that
 * is not a list at all. It composes with FAKE_VANISH_PRODUCERS, and it is the
 * only way to make the sweep's own re-read unreadable AFTER a good list is
 * already stored. See the block that reads it.
 */
import { writeFileSync } from "node:fs";

const mode = process.env.FAKE_MODE ?? "normal";
const argv = process.argv.slice(2).filter((a) => a !== "--json" && !a.startsWith("--profile"));
// Drop a --profile's value if present.
const args: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (
    process.argv.includes("--profile") &&
    argv[i] === process.argv[process.argv.indexOf("--profile") + 1]
  )
    continue;
  args.push(argv[i]);
}

const say = (obj: unknown): never => {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
};
const die = (msg: string, code = 1): never => {
  process.stderr.write(msg);
  process.exit(code);
};

if (process.argv.includes("--version")) {
  process.stdout.write("0.35.1-fake\n");
  process.exit(0);
}

if (mode === "unreachable") {
  die(
    JSON.stringify({ success: false, error: { message: "connect ECONNREFUSED api-staging" } }),
    1
  );
}

if (args[0] === "auth" && args[1] === "status")
  say({ success: true, data: { organization: "fake-org" } });

// A leaf's path is every non-flag argument that is not a threaded id. Ids here
// are always `fake-<n>`, so anything matching that is an argument, not a path.
const pathParts: string[] = [];
const threaded: string[] = [];
for (const a of args) {
  if (/^fake-/.test(a)) threaded.push(a);
  else pathParts.push(a);
}
const leaf = pathParts.join(" ");

// Any leaf with no threaded id is being invoked as a PRODUCER.
const isProducer = threaded.length === 0;

// FAKE_VANISH_PRODUCERS: a comma-separated list of producer leaves whose FIRST
// row exists on their first read and is gone from every later one, and whose id
// 404s from every consumer.
//
// ══════════════════════════════════════════════════════════════════════════════
// 🚨 THIS IS THE ONE STATE THE RACE CANNOT BE PROVEN WITHOUT, AND IT CANNOT BE
//    PRODUCED AGAINST STAGING
// ══════════════════════════════════════════════════════════════════════════════
//
// The defect is a row deleted BETWEEN the sweep's list call and its read, by a
// job this process does not control. Waiting for `CLI: E2E flows` to tear down
// inside the window is exactly the on-luck reproduction that made the red
// unexplained for four runs: two of them were green with a concurrent run in
// flight, because it was in its CREATE phase.
//
// So the delete is produced HERE, deterministically, through the same
// `NEXUS_BIN` seam CI already uses. It needs cross-invocation state because this
// fixture is spawned once per call and sees only its own argv - FAKE_STATE_DIR
// holds one marker file per producer, and its ABSENCE is what makes a read the
// first one.
//
// ⚠️ THE VANISHING ROW IS FIRST, NOT ONLY. A producer that emptied entirely
// would be indistinguishable from `FAKE_MODE=empty` and would prove the wrong
// thing: the sweep would report SKIPPED_NO_ID and pass for a reason that has
// nothing to do with the race. The second row is what a re-thread must find.
const vanishProducers = (process.env.FAKE_VANISH_PRODUCERS ?? "").split(",").filter(Boolean);
const stateDir = process.env.FAKE_STATE_DIR;

// FAKE_UNREADABLE_REREAD: producers whose FIRST read is a good list and whose
// every LATER read answers exit 0 with a body that is not JSON at all.
//
// 🚨 THE ONE SHAPE THAT SEPARATES "EXIT 0" FROM "PARSED AS A LIST". A route
// answering 200 with an error page is the real-world source of it, and it cannot
// be produced by FAKE_FAIL_LEAVES: that knob breaks a leaf on EVERY invocation,
// including the first, so the sweep never stores a good list to lose. The defect
// this exists for is a good list being REPLACED by an unreadable re-read, which
// needs the two reads to differ — the same first-vs-later state the vanishing
// producers need, and it reuses it.
const unreadableReread = (process.env.FAKE_UNREADABLE_REREAD ?? "").split(",").filter(Boolean);

function firstReadOf(producer: string): boolean {
  if (stateDir === undefined)
    die(
      "FAKE_VANISH_PRODUCERS / FAKE_UNREADABLE_REREAD need FAKE_STATE_DIR - refusing to fake a race with no state\n",
      1
    );
  const marker = `${stateDir}/read-${producer.replace(/\W+/g, "_")}`;
  // `wx` fails when the file is already there, so the CHECK and the WRITE are one
  // syscall. A stat-then-write would race against the sweep's own re-read.
  try {
    writeFileSync(marker, "1", { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

const DOOMED = /-doomed$/;

if (isProducer) {
  if (mode === "empty") say({ success: true, data: [] });

  const slug = leaf.replace(/\s+/g, "-");
  const survivor = { id: `fake-${slug}-1`, slug: `fake-slug-1` };
  const doomed = { id: `fake-${slug}-doomed`, slug: `fake-slug-0` };

  // ⚠️ `firstReadOf` CONSUMES its marker, so it is asked exactly ONCE per process
  // and the answer reused. Two callers each asking would make the second read of
  // a single invocation report itself as a later one.
  const needsReadState = vanishProducers.includes(leaf) || unreadableReread.includes(leaf);
  const isFirstRead = needsReadState ? firstReadOf(leaf) : true;

  // Exit 0, and not a list. Placed BEFORE the vanish branch so it composes with
  // it: the first read still publishes the doomed row, so the sweep threads it,
  // gets a not-found, and re-reads — and it is that re-read that is unreadable.
  if (unreadableReread.includes(leaf) && !isFirstRead) {
    process.stdout.write("<html>502 Bad Gateway</html>");
    process.exit(0);
  }

  if (vanishProducers.includes(leaf)) {
    // FAKE_VANISH_LEAVES_NOTHING: the doomed row was this producer's LAST row,
    // so the re-read that proves the deletion comes back EMPTY. That is the race
    // at full strength, and it is the one shape indistinguishable from an
    // untouched producer that simply has nothing — which is why it needs its own
    // knob rather than falling out of the case above.
    if (process.env.FAKE_VANISH_LEAVES_NOTHING === "1") {
      say({ success: true, data: isFirstRead ? [doomed] : [] });
    }
    if (isFirstRead) say({ success: true, data: [doomed, survivor] });
  }
  // One row is enough - the harness threads the first id it finds. `slug` is
  // carried so the param-named-field rule is exercised rather than assumed.
  say({ success: true, data: [survivor] });
}

// A consumer handed the doomed id answers exactly what the real API answers for
// a deleted row: the CLI's `not-found` category (4) with a NOT_FOUND document.
// Deliberately NOT a bespoke code - the runner reads the taxonomy, so a fixture
// inventing its own number would prove nothing about production.
if (threaded.some((id) => DOOMED.test(id))) {
  process.stderr.write(`warning: a line of unrelated stream noise\n`);
  console.log(
    JSON.stringify(
      {
        error: {
          message: `Not found: ${threaded.find((id) => DOOMED.test(id))}`,
          hint: null,
          code: "NOT_FOUND"
        }
      },
      null,
      2
    )
  );
  process.exit(4);
}

// FAKE_FAIL_LEAVES: a comma-separated list of leaf paths that answer exit 0 with
// non-JSON, so a run with a CHOSEN NUMBER of failures can be produced on demand.
// It exists for one regression: the runner used to exit with the failure COUNT,
// so 4 failures were indistinguishable from a preflight refusal and 7 from an
// empty id source. Reproducing that needs a run with exactly 4, and exactly 7.
//
// 🚨 THERE IS NO `FAKE_FAIL_N`, AND IT IS NOT AN OMISSION. One existed, was
// documented as "fail the first N leaves in sorted order", and did NOTHING on
// its own - it only ever consulted this list. Setting it alone produced
// `32 reached · 0 failed` at exit 0, so the knob added to prove the exit-code
// fix silently proved nothing, and read as available the whole time.
//
// It cannot be implemented here either, which is why it is deleted rather than
// repaired: THIS FIXTURE IS SPAWNED ONCE PER LEAF and sees only its own argv.
// It never sees the set, so it cannot rank one. Whoever knows the ordering is
// the CALLER, and handing the list in is the only honest interface. Naming the
// leaves also makes a run reproducible - "the first 4" moves the day a command
// is added, and the same command then reproduces a different scenario.
// FAKE_REFUSE_LEAVES: "<leaf>:<exitCode>,..." - named leaves exit non-zero with a
// CHOSEN code, so the runner's exit-CATEGORY rule can be exercised in both
// directions with one knob.
//
// 🚨 BOTH DIRECTIONS IS THE POINT. A knob that only produces `invalid-input`
// would prove the harness can skip and never prove it still FAILS on anything
// else - and a rule that softened every non-zero would rebuild the false-green
// this whole harness refuses. 5 is `invalid-input` and must SKIP; 6 is
// `remote-error` and must FAIL.
//
// The codes are literals here and nowhere in `src/`, because this fixture stands
// in for a CLI it must not import.
if (process.env.FAKE_REFUSE_LEAVES !== undefined) {
  for (const spec of process.env.FAKE_REFUSE_LEAVES.split(",").filter(Boolean)) {
    const [name, code, documentCode] = spec.split(":");
    if (name !== leaf) continue;

    // 🚨 THE DOCUMENT CODE IS THE THIRD FIELD BECAUSE THE EXIT CODE IS NOT
    // ENOUGH. `invalid-input` (5) is reached BOTH by a client-side refusal that
    // sent nothing and by a 400/409/422 that came back over the wire, and the
    // runner has to call the first a SKIP and the second a FAILURE. Without a
    // way to emit both shapes at exit 5, the control cannot tell whether the
    // runner is discriminating or just softening every 5 - which is exactly the
    // hole this argument was added to close.
    if (documentCode !== undefined) {
      // 🚨 PRETTY-PRINTED, ON STDOUT, WITH NOISE ON STDERR - because that is what
      // the real CLI does, and a double that emits anything else is a claim
      // about production nobody checked.
      //
      // `emitDocument` is `console.log(JSON.stringify(value, null, 2))`: it
      // pretty-prints UNCONDITIONALLY, so a real document always spans several
      // lines. This fixture emitted SINGLE-LINE JSON for one revision, a shape
      // the CLI never produces, and eleven unit tests plus a mutation control
      // all passed against it while the reader could not parse real output at
      // all. The stderr line is here for the same reason: the sweep
      // concatenates both streams, so a document sitting alone in stdout is the
      // EASY case and the concatenated one is the case that actually broke.
      process.stderr.write(`warning: a line of unrelated stream noise\n`);
      console.log(
        JSON.stringify(
          { error: { message: `refused ${leaf}`, hint: null, code: documentCode } },
          null,
          2
        )
      );
    } else {
      process.stderr.write(`refused ${leaf} with ${code}`);
    }
    process.exit(Number(code));
  }
}

if (process.env.FAKE_FAIL_LEAVES !== undefined) {
  const failing = process.env.FAKE_FAIL_LEAVES.split(",").filter(Boolean);
  if (failing.includes(leaf)) {
    process.stdout.write("<html>502</html>");
    process.exit(0);
  }
}

if (mode === "badshape" && leaf === "agent-tool list") {
  process.stdout.write("<html>502 Bad Gateway</html>");
  process.exit(0);
}

say({ success: true, data: { id: threaded[0], leaf, threaded } });
