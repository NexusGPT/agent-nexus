/**
 * THE SWEEP'S EXIT POLICY IS EXECUTED HERE, NOT READ.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE HOLE THIS CLOSES, AND WHY IT SURVIVED A SPEC THAT LOOKS LIKE IT COVERS IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `scripts/sweep.sh` ends with the whole of its contract:
 *
 *   if [[ "$STRICT" == "true" ]]; then
 *     exit $(( FAIL + WARN ))
 *   fi
 *   exit "$FAIL"
 *
 * `sweep-skips-only-a-declared-opt-out.test.ts` pins that by matching the
 * script's SOURCE — `expect(exits).toContain("exit $(( FAIL + WARN ))")`. That
 * asserts the string is PRESENT. It says nothing about WHEN the line runs, and
 * the `if` above it is where the entire policy lives.
 *
 * 🔴 MEASURED 2026-09-09, ONE MUTANT: change the guard to `== "false"` and leave
 * the grepped string untouched.
 *
 *   | arm                               | pristine | mutant  |
 *   |-----------------------------------|----------|---------|
 *   | the source-match assertion        | green    | GREEN   |
 *   | a sweep carrying one WARN, strict | exit 1   | exit 0  |
 *
 * The printed summary is byte-identical across those two sweeps — it still reads
 * `1 warn · 0 fail · STRICT (warn counts as fail)` — so nothing a reader or a
 * log scraper sees changes either. `CLI: Sweep` is a required context on
 * `staging`, so under that mutant it goes on reporting green while it has
 * stopped promoting a JSON-contract violation to a failure.
 *
 * A repair that changes an assertion's TEXT and not its KILL SET has done
 * nothing, and neither arm's own green can say so. This file is the arm that
 * dies on that mutant.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * HOW IT RUNS WITH NO CREDENTIAL, NO TENANT AND NO NETWORK CALL OF ITS OWN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `sweep.sh` reads `NEXUS_BIN` from the environment and splits it on whitespace
 * into an argv array — the same mechanism the `cli-sweep` job uses to point the
 * sweep at the PR-built artefact. So a stub binary is the CLI as far as the
 * sweep can tell, and every branch of the exit policy is reachable from a test.
 * `test/fixtures/nexus-stub.sh` is that stub and carries the argv contract.
 *
 * The sweep still derives its own leaf list from `src/command-universe.ts` and
 * still runs its own preflight, so what is under test is the real script over
 * the real population — only the responses are substituted.
 *
 * ⚠️ WHAT THIS DOES NOT COVER: `sweep.sh`'s preflight curls the npm registry for
 * a version-drift note. That call is the script's, not this spec's, and it is
 * already guarded by `|| echo "?"` — but it does mean these cases touch the
 * network on a machine that has it, and are simply slower on one that does not.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 WHY EVERY CASE ASSERTS AN EXACT CODE AND THE PRESENCE OF `Summary:`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The sweep's REFUSALS share a number space with its FAIL count: 2 unknown arg,
 * 3 binary unavailable, 4 not authenticated, 5/6/7 a derivation failed, 8 the
 * policy matcher could not be sourced. So `expect(status).toBeGreaterThan(0)`
 * is satisfied by a sweep that never reached a single leaf, which is the exact
 * vacuous green this file exists to delete one layer down.
 *
 * `summaryOf` is the discriminator and it THROWS rather than defaulting: a
 * refusal prints `FATAL:` on stderr and no summary at all, a run that counted
 * always prints one.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { classifyCommandUniverse } from "./command-universe";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SWEEP = join(PACKAGE_ROOT, "scripts", "sweep.sh");
const STUB = join(PACKAGE_ROOT, "test", "fixtures", "nexus-stub.sh");

interface Outcome {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface Conditions {
  readonly strict: boolean;
  readonly warn?: readonly string[];
  readonly fail?: readonly string[];
}

/** Every leaf the sweep executes, and the skips this repository has declared. */
let safeLeaves: readonly string[] = [];
let declaredSkips: readonly string[] = [];
/** A leaf that is swept and is NOT excused by a declaration — derived, never named. */
let target = "";

/**
 * Each configuration is swept ONCE, in the hook, and the cases read the stored
 * outcome. A full sweep is several seconds of real work — the script derives its
 * leaf list through `tsx` and then executes every leaf — so a case that re-ran
 * one it had already paid for would add that again for nothing.
 *
 * The sweeps are AWAITED, never run synchronously; `runSweep`'s docblock carries
 * the reason and the measurement, and it is the difference between this file
 * being safe and it being a false red on a loaded runner.
 *
 * The hook stores RAW outcomes and asserts nothing. A refusal has to fail inside
 * the case that depends on it, where the failure names the property; raised here
 * it would kill the file and attribute the loss to no rule at all.
 */
const outcomes = new Map<string, Outcome>();

beforeAll(async () => {
  const universe = await classifyCommandUniverse();
  safeLeaves = universe.safe;
  declaredSkips = universe.expectedSkips;
  target = safeLeaves.find((leaf) => !declaredSkips.includes(leaf)) ?? "";
  if (target === "") return;

  // CONCURRENT, which is only available because the sweeps are async: five
  // independent child processes sharing no state, so the hook costs about one
  // sweep rather than five. Each carries its own env and its own temp files.
  const configured: readonly (readonly [string, Conditions])[] = [
    ["clean", { strict: true }],
    ["warn:relaxed", { strict: false, warn: [target] }],
    ["warn:strict", { strict: true, warn: [target] }],
    ["fail:relaxed", { strict: false, fail: [target] }],
    ["fail:strict", { strict: true, fail: [target] }]
  ];
  const settled = await Promise.all(configured.map(([, conditions]) => runSweep(conditions)));
  configured.forEach(([key], index) => outcomes.set(key, settled[index]));
});

/** The stored outcome, or a loud failure — never a silently absent one. */
function outcome(key: string): Outcome {
  const stored = outcomes.get(key);
  if (stored === undefined) {
    throw new Error(`no sweep was run for "${key}" — the hook did not reach it.`);
  }
  return stored;
}

/**
 * 🚨 ASYNC ON PURPOSE, AND `spawnSync` HERE IS A FALSE RED WAITING TO HAPPEN.
 *
 * vitest talks to its worker over birpc, whose `DEFAULT_TIMEOUT` is `6e4` —
 * `node_modules/vitest/dist/chunks/index.B521nVV-.js`, vitest 3.2.4. It is a
 * destructuring default, vitest passes no `timeout` of its own, and no
 * user-facing option overrides it, so 60s is hard. The worker's `onTaskUpdate`
 * RPC is in flight while a hook runs; hold the event loop past that and the run
 * ends `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` at exit 1 —
 * with every test above it reported PASSED. A red that no assertion explains.
 *
 * `spawnSync` blocks the loop for the whole child, and five of them in one hook
 * is ONE uninterrupted stretch. Measured on this file, five sweeps: hook span
 * 39107 ms with the interval probe ticking **0** times against ~782 expected —
 * i.e. 65% of the ceiling spent, in a single stretch, on a machine CI does not
 * share. Awaiting an async spawn frees the loop while each child runs, so the
 * heartbeat is answered throughout and the ceiling stops applying at all.
 *
 * ⚠️ Yielding BETWEEN the sweeps would also work today and does not survive
 * growth: it caps the stretch at ONE sweep rather than removing the block, and
 * the sweep's cost tracks the leaf list. This removes the failure mode instead
 * of moving it further away.
 */
function runSweep(conditions: Conditions): Promise<Outcome> {
  const args = [SWEEP, "--profile", "stub"];
  if (conditions.strict) args.push("--strict");

  const child = spawn("bash", args, {
    cwd: PACKAGE_ROOT,
    env: {
      ...process.env,
      // `bash <path>`, not the path alone: the exec bit is then not load-bearing.
      NEXUS_BIN: `bash ${STUB}`,
      // Answer the declared skips the way the environment does, so a healthy run
      // reports `n/n declared skip` rather than a wall of STALE declarations.
      STUB_SKIP_LEAVES: declaredSkips.join("\n"),
      STUB_WARN_LEAVES: (conditions.warn ?? []).join("\n"),
      STUB_FAIL_LEAVES: (conditions.fail ?? []).join("\n")
    }
  });

  return new Promise<Outcome>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    // `close`, not `exit`: `exit` can fire before the pipes have flushed, which
    // would drop the `Summary:` line the cases key on and turn a real count into
    // a spurious REFUSAL.
    child.on("close", (code) => resolve({ status: code ?? -1, stdout, stderr }));
  });
}

/**
 * The sweep's own summary line.
 *
 * Throws when there is none, because that is what separates a COUNT from a
 * REFUSAL — and the refusal codes overlap the counts, so a status alone cannot.
 */
function summaryOf(outcome: Outcome): string {
  const match = outcome.stdout.match(/^Summary: .*$/m);
  if (match === null) {
    throw new Error(
      `sweep.sh printed no Summary line, so it REFUSED rather than counting (exit ${outcome.status}). ` +
        `Its exit code is therefore not a FAIL+WARN total. stderr:\n${outcome.stderr.slice(0, 800)}`
    );
  }
  return match[0];
}

describe("the sweep's exit policy, executed", () => {
  it("derives a population to sweep and a target leaf inside it", () => {
    // Vacuity controls, each ahead of the cases that depend on them. An empty
    // population would make every assertion below true of nothing.
    expect(safeLeaves.length).toBeGreaterThan(0);
    expect(declaredSkips.length).toBeGreaterThan(0);
    expect(target).not.toBe("");
    expect(safeLeaves).toContain(target);
  });

  it("exits 0 when every leaf answers with JSON", () => {
    const clean = outcome("clean");

    // The control that makes the non-zeros below mean something: this rig CAN
    // produce a zero, so a later 1 is the condition and not the harness.
    expect(summaryOf(clean)).toMatch(/· 0 warn · 0 fail ·/);
    expect(clean.status).toBe(0);
  });

  it("promotes a WARN to a failure under --strict, and ONLY under --strict", () => {
    // A leaf that exits 0 and emits plain text: the JSON-contract violation the
    // whole gate exists for. It is a WARN, and a WARN is invisible by default.
    const relaxed = outcome("warn:relaxed");
    expect(summaryOf(relaxed)).toMatch(/· 1 warn · 0 fail ·/);
    expect(relaxed.status).toBe(0);

    const strict = outcome("warn:strict");
    expect(summaryOf(strict)).toMatch(/· 1 warn · 0 fail ·/);
    // 🔴 THE ARM. Inverting `sweep.sh`'s `$STRICT` guard flips BOTH of these —
    // the relaxed run starts counting the WARN and the strict run stops — while
    // the sibling spec's source match stays green and both summaries are
    // byte-identical to the ones above.
    expect(strict.status).toBe(1);
  });

  it("counts a FAIL in BOTH modes — a real regression is never mode-dependent", () => {
    const relaxed = outcome("fail:relaxed");
    expect(summaryOf(relaxed)).toMatch(/· 0 warn · 1 fail ·/);
    expect(relaxed.status).toBe(1);

    const strict = outcome("fail:strict");
    expect(summaryOf(strict)).toMatch(/· 0 warn · 1 fail ·/);
    expect(strict.status).toBe(1);
  });

  it("never counts a declared SKIP, in either mode", () => {
    // The clean run answers every declared skip with the policy refusal, so its
    // total is the one that says whether SKIP contributes. Asserted against the
    // DENOMINATOR the sweep prints, so a declaration that stopped skipping shows
    // up here rather than shifting a bare numerator nobody reads.
    for (const key of ["clean", "warn:relaxed"]) {
      const run = outcome(key);
      expect(summaryOf(run)).toMatch(
        new RegExp(`· ${declaredSkips.length}/${declaredSkips.length} declared skip ·`)
      );
    }
    expect(outcome("clean").status).toBe(0);
  });
});
