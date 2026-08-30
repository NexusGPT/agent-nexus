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
 */

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

if (isProducer) {
  if (mode === "empty") say({ success: true, data: [] });
  // One row is enough - the harness threads the first id it finds. `slug` is
  // carried so the param-named-field rule is exercised rather than assumed.
  say({
    success: true,
    data: [{ id: `fake-${leaf.replace(/\s+/g, "-")}-1`, slug: `fake-slug-1` }]
  });
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
