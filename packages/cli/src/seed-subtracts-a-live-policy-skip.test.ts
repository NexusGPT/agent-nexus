/**
 * THE SEED SUBTRACTS A DECLARED POLICY SKIP — AND ONLY WHILE IT IS STILL BEING
 * REFUSED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `SWEEP_EXPECTED_SKIPS` names the leaves whose coverage this repository has
 * ACCEPTED losing to environment policy. `sweep.sh` reads it, which is why
 * `CLI: Sweep` is green over `role job-types` against an organization opted out
 * of the Role primitive. Nothing told `seed-sweep-fixtures.sh`: it derived its
 * contract from `fixtureBacked` alone, POSTed into a leaf the environment
 * refuses by policy, took the 403 that refusal is supposed to produce, and
 * exited 2. Permanently — `CLI: E2E flows` was red on four consecutive runs with
 * step 10 the only failing step in every one, and no code change could clear it.
 *
 * Two consumers derived from one table and only one accounted for policy skips.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE FAILURE THIS FILE EXISTS FOR IS THE *UNCONDITIONAL* SUBTRACTION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Subtracting every declared leaf closes today's red and opens tomorrow's silent
 * hole, which is the same defect one level up. `staleExpectedSkips` catches a
 * declaration that was renamed, deleted or reclassified. It cannot catch one
 * that stops FIRING, because an organization being opted back IN is invisible to
 * every static check — the declaration still names a real, still-swept leaf.
 *
 * So an unconditional subtraction would silently stop asserting a fixture that
 * had become assertable again, and would leave a declaration standing to excuse
 * the next leaf that goes dark. That is a slow, permanent, invisible loss, and
 * it is strictly worse than the loud red it replaces.
 *
 * The assertions below are therefore lopsided in the same direction as
 * `sweep-skips-only-a-declared-opt-out.test.ts`: ONE case proves the subtraction
 * happens, and THREE prove that things which merely resemble it do not get
 * subtracted.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY IT RUNS THE SCRIPT INSTEAD OF READING IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Its siblings pin `sweep.sh` and this seed by reading their source, because
 * neither can reach a live API. This one does not have to: `NEXUS_BIN` is the
 * override both scripts already honour, so a stub answering the leaves is a
 * complete environment. A source-reading assertion here would pin the SHAPE of a
 * conditional and say nothing about which branch it takes — and a conditional
 * whose other branch has never been observed is an untested claim about a
 * conditional.
 *
 * The derivation is NOT stubbed. `--print-expected-skips` and
 * `--print-fixture-leaves` run for real against the real table, because "the
 * seeder reads the same producer the sweep reads" is half of what is being
 * proved. Stubbing them would leave this spec green over a seeder that had gone
 * back to a hardcoded list.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS CANNOT DO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The stub emits the opt-out document the CLI is believed to emit today. It
 * never calls staging, so it cannot prove the live response still takes that
 * shape — a backend reword re-reds the job silently and no assertion here sees
 * it. That coupling is documented in `scripts/policy-refusal.sh`, not enforced.
 */
import { execFile } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { classifyCommandUniverse } from "./command-universe";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = join(PACKAGE_ROOT, "scripts", "seed-sweep-fixtures.sh");

/**
 * The one leaf that is BOTH fixture-backed and a declared expected skip — the
 * intersection this whole change is about.
 *
 * Asserted rather than assumed in `beforeAll` below: if that intersection ever
 * empties, every scenario here would stub a leaf nothing subtracts and the file
 * would pass while testing nothing.
 */
const DECLARED_FIXTURE_LEAF = "role job-types";

/** Fixture-backed and NOT declared — the control for the undeclared case. */
const UNDECLARED_FIXTURE_LEAF = "user-group list";

/**
 * The shape `printCliError` emits under `--json` — see `src/errors.ts`. The
 * message carries the `API error (<status>): ` prefix the CLI prepends, because
 * that prefix sits between `"message": "` and the phrase and any matcher has to
 * survive it.
 *
 * ✅ WRITTEN OUT LITERALLY, ON PURPOSE, SO THE GATE CAN POLICE IT.
 * `error-envelope-help-is-true.test.ts` scans this package for `{"error":{…}}`
 * fragments and requires each to name exactly the key set the emitter puts on
 * the wire. This file is in that corpus — only the detector's own file is
 * excluded — so a literal fragment here is CHECKED: add a fourth key to
 * `CliErrorDocument` and the gate names this file and refuses until the stub
 * follows. That is the whole reason to spell it out.
 *
 * These documents claim to be what `printCliError` emits. A claim about the
 * emitter that nothing compares to the emitter is exactly the drift that gate
 * exists to break, and a stub drifting from the real envelope is worse than
 * most: it would keep passing while testing a shape the CLI no longer produces.
 *
 * ⚠️ IT WAS BRIEFLY BUILT WITH `JSON.stringify` INSTEAD, AND THAT WAS
 * SCAFFOLDING RATHER THAN A DESIGN. `keysNamedBy` used to take every
 * identifier-shaped quoted token and drop the first, so an identifier-shaped
 * VALUE — `FEATURE_NOT_ENABLED`, `INTERNAL` — was counted as a fourth KEY and a
 * correct fragment was reported as disagreeing with the emitter. Building the
 * document produced identical bytes at runtime and left no literal for the
 * detector to misread — which also left none for it to CHECK. The detector now
 * reads key POSITION rather than token shape, so the workaround costs coverage
 * and buys nothing. Do not reintroduce it.
 */

/**
 * A stub `nexus`. Reads are anything ending in `--json`; everything else is a
 * create, and every create REFUSES so no scenario's outcome depends on a write
 * the real environment may or may not accept.
 */
const STUB = `#!/usr/bin/env bash
set -u
ARGS="$*"
in_list() { case "|\${2:-}|" in *"|$1|"*) return 0 ;; esac; return 1; }

case "$ARGS" in
  *--json)
    KEY="\${ARGS% --json}"
    if in_list "$KEY" "\${STUB_POLICY:-}"; then
      echo '{"error":{"message":"API error (403): This organization has opted out of this feature","hint":null,"code":"FEATURE_NOT_ENABLED"}}'
      exit 1
    fi
    if in_list "$KEY" "\${STUB_ERROR:-}"; then
      echo '{"error":{"message":"API error (500): Internal server error","hint":null,"code":"INTERNAL"}}'
      exit 1
    fi
    if in_list "$KEY" "\${STUB_EMPTY:-}"; then
      echo '{"data":[]}'
      exit 0
    fi
    echo '{"data":[{"id":"stub"}]}'
    exit 0
    ;;
  *)
    echo '{"error":{"message":"API error (400): stub refuses every write","hint":null,"code":"BAD_REQUEST"}}'
    exit 1
    ;;
esac
`;

let stubPath: string;

interface Run {
  readonly status: number;
  readonly output: string;
}

const execFileAsync = promisify(execFile);

/**
 * Run the seed against the stub. Never throws — a non-zero exit IS the datum.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 ASYNC ON PURPOSE. `execFileSync` HERE REDDENED THE WHOLE SUITE WITH ZERO
 * FAILING TESTS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Each scenario runs the real seed script, which shells out to two `tsx`
 * derivations and a stub per leaf — 6 to 30 seconds of wall clock apiece. Run
 * synchronously that is 6 to 30 seconds during which this worker's event loop
 * cannot turn.
 *
 * vitest's worker reports each finished test to the main process over birpc and
 * awaits the reply. A worker blocked in `execFileSync` cannot process that reply,
 * so with several such tests back to back the call ages past birpc's timeout and
 * the worker throws:
 *
 *     Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * 🚨 THAT SURFACES AS `Errors 1 error` AND EXIT 1 WITH EVERY TEST REPORTED
 * PASSED — `Test Files 201 passed`, `Tests 3330 passed`, and the run still red.
 * It names no test and no file, so it reads as a runner flake and gets re-run
 * forever; it is neither flaky nor the runner's fault. Measured on
 * `cluster/status-guards-10`: reproduced on the unmodified base, so it is this
 * spec and not whatever change happens to be in the tree.
 *
 * Awaiting `execFile` leaves the loop free while the subprocess runs, which is
 * the whole fix. Do not put the sync form back to save a few `await`s.
 */
async function seed(env: Record<string, string>): Promise<Run> {
  try {
    const { stdout } = await execFileAsync("bash", [SEED], {
      encoding: "utf8",
      env: {
        ...process.env,
        NEXUS_PROFILE: "",
        NEXUS_BIN: stubPath,
        ...env
      }
    });
    return { status: 0, output: stdout };
  } catch (error) {
    // The async form reports the exit status on `code`, where the sync form used
    // `status`. Reading the wrong one silently yields -1 for every failing run,
    // which would make `toBeGreaterThan(0)` pass for the wrong reason.
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      status: typeof failure.code === "number" ? failure.code : -1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`
    };
  }
}

/** The verification loop's own line for a leaf, which is the one under test. */
const unsatisfied = (leaf: string): RegExp => new RegExp(`UNSATISFIED\\s+${leaf} —`);
const staleFor = (leaf: string): RegExp => new RegExp(`STALE\\s+${leaf} —`);
const skippedFor = (leaf: string): RegExp => new RegExp(`skipped ${leaf} —`);

describe("the seed subtracts a declared policy skip, and only a live one", () => {
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "seed-policy-skip-"));
    stubPath = join(dir, "nexus-stub.sh");
    writeFileSync(stubPath, STUB);
    chmodSync(stubPath, 0o755);
  });

  it("has a leaf in the intersection — an empty one makes every case below vacuous", async () => {
    // The control on the whole file. Both scenarios stub `DECLARED_FIXTURE_LEAF`
    // and read the seeder's verdict about it; if that leaf stopped being either
    // fixture-backed or declared, every assertion would still pass while proving
    // nothing at all about the conditional.
    const report = await classifyCommandUniverse();
    expect(report.fixtureBacked).toContain(DECLARED_FIXTURE_LEAF);
    expect(report.expectedSkips).toContain(DECLARED_FIXTURE_LEAF);

    // And the undeclared control really is undeclared, for the same reason.
    expect(report.fixtureBacked).toContain(UNDECLARED_FIXTURE_LEAF);
    expect(report.expectedSkips).not.toContain(UNDECLARED_FIXTURE_LEAF);
  });

  it("SUBTRACTS a declared leaf that is STILL refused by policy — exit 0", async () => {
    // The permanently-red case, which is what this change is for. Nothing this
    // script can write satisfies the leaf, and the repository has said so.
    const run = await seed({ STUB_POLICY: DECLARED_FIXTURE_LEAF });

    expect(run.output).toMatch(skippedFor(DECLARED_FIXTURE_LEAF));
    expect(run.output).not.toMatch(unsatisfied(DECLARED_FIXTURE_LEAF));
    expect(run.output).not.toMatch(staleFor(DECLARED_FIXTURE_LEAF));
    // And it must SAY it subtracted one. A silent subtraction is
    // indistinguishable from a leaf that was never derived.
    expect(run.output).toContain("1 declared policy skip");
    expect(run.status).toBe(0);
  });

  // ── The three that must stay RED ─────────────────────────────────────────

  it("FAILS a declared leaf that ANSWERS and is empty, naming BOTH problems", async () => {
    // 🔴 THE CASE THE UNCONDITIONAL SUBTRACTION LOSES. The organization was
    // opted back in, so the refusal has lifted: the fixture is genuinely
    // unsatisfied AND the declaration is now excusing nothing. Reporting only
    // the fixture leaves a live declaration ready to excuse the next leaf that
    // goes dark, which is the coverage-loss-with-no-event this mechanism exists
    // to make visible.
    const run = await seed({ STUB_EMPTY: DECLARED_FIXTURE_LEAF });

    expect(run.output).toMatch(unsatisfied(DECLARED_FIXTURE_LEAF));
    expect(run.output).toMatch(staleFor(DECLARED_FIXTURE_LEAF));
    expect(run.output).not.toMatch(skippedFor(DECLARED_FIXTURE_LEAF));
    // The remedy has to name the file the line lives in, where the reader is.
    expect(run.output).toContain("SWEEP_EXPECTED_SKIPS");
    expect(run.output).toContain("src/command-universe.ts");
    expect(run.status).toBeGreaterThan(0);
  });

  it("does NOT call a declared leaf's 500 a stale declaration", async () => {
    // An outage says nothing about a feature flag. Reporting it as stale sends
    // a reader to delete a line that is still true, and the next run re-reds
    // with no declaration left to excuse it — so `empty` and `error` must not
    // merge, which is why the classifier has four states and not two.
    const run = await seed({ STUB_ERROR: DECLARED_FIXTURE_LEAF });

    expect(run.output).toMatch(unsatisfied(DECLARED_FIXTURE_LEAF));
    expect(run.output).not.toMatch(staleFor(DECLARED_FIXTURE_LEAF));
    expect(run.output).not.toMatch(skippedFor(DECLARED_FIXTURE_LEAF));
    expect(run.status).toBeGreaterThan(0);
  });

  it("does NOT subtract a policy refusal nobody declared", async () => {
    // The phrase says the refusal is POLICY. It does not say anyone accepted the
    // coverage loss, and only `SWEEP_EXPECTED_SKIPS` carries that. Subtracting on
    // the phrase alone is the blanket amnesty — a leaf could go dark and this
    // script would report a clean seed over it forever. `sweep.sh` fails an
    // undeclared skip for exactly this reason; so does this.
    const run = await seed({ STUB_POLICY: UNDECLARED_FIXTURE_LEAF });

    expect(run.output).toContain("UNDECLARED policy refusal");
    expect(run.output).not.toMatch(skippedFor(UNDECLARED_FIXTURE_LEAF));
    expect(run.output).toContain("0 declared policy skip");
    expect(run.status).toBeGreaterThan(0);
  });

  it("still fails an ordinary empty leaf that nobody declared", async () => {
    // The pre-existing contract, asserted here because the change adds branches
    // ahead of it: a `safe-with-fixture` leaf that answers and holds nothing is
    // the failure this whole disposition exists for, and it must survive every
    // subtraction added in front of it.
    const run = await seed({ STUB_EMPTY: UNDECLARED_FIXTURE_LEAF });

    expect(run.output).toMatch(unsatisfied(UNDECLARED_FIXTURE_LEAF));
    expect(run.output).not.toMatch(staleFor(UNDECLARED_FIXTURE_LEAF));
    expect(run.status).toBeGreaterThan(0);
  });
});
