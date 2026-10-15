/**
 * A `SWEEP_EXPECTED_SKIPS` DECLARATION IS STALE ONLY WHEN THE ENVIRONMENT HAS
 * ANSWERED — AND A 503 IS NOT AN ANSWER.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS EXISTS FOR, MEASURED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `sweep.sh`'s stale-declaration loop tested `status != "SKIP"`, so during the
 * staging outage of 2026-10-15 — when every leaf 503'd — it reported five
 * legitimate opt-out declarations as stale, under its own headline:
 *
 *   STALE declarations (5) — SWEEP_EXPECTED_SKIPS names these and they no longer skip.
 *   This is GOOD NEWS and fails nothing: the environment answers again.
 *     · role automation-settings answered FAIL   · role list answered FAIL
 *     · role governance answered FAIL            · ticket list answered FAIL
 *     · role job-types answered FAIL
 *
 * Read off `CLI: Sweep` on PR #8071 — run 38676794108, attempt 1. A reader
 * following the remedy printed
 * beside those lines deletes five correct declarations; the next time those
 * features are opted out, each leaf reports an UNDECLARED SKIP and the CAUSE
 * that justified the declaration is gone from the tree.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 BOTH DIRECTIONS, BECAUSE ONE OF THEM IS THE ARM THAT CAN STOP ME
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The cheap fix — never report staleness at all — passes a spec that only checks
 * the outage case, and it deletes the whole mechanism: a leaf whose opt-out has
 * genuinely lifted then keeps its declaration for ever, which is the loss
 * `sweep.sh`'s own header says the denominator exists to make visible.
 *
 * So the two sweeps below are a PAIR and neither is evidence alone:
 *
 *   ANSWERED — declared skips come back PASS → every one is reported STALE
 *   OUTAGE   — declared skips come back FAIL → NONE is reported stale
 *
 * ⚠️ THE SWEEPS ARE SEQUENTIAL AND AWAITED, not concurrent, and that is copied
 * from `sweep-promotes-warn-only-under-strict.test.ts`'s own measurement rather
 * than from taste. Its header records eleven concurrent real sweeps across two
 * files starving the package's longest spec into a 60s birpc deadline with every
 * test reported PASSED. This file adds two to that population; awaiting each
 * child frees the event loop while it runs, so this worker keeps answering its
 * own RPC.
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

let declaredSkips: readonly string[] = [];
let declaredRouteAbsences = "";
const outcomes = new Map<string, Outcome>();

/**
 * `extraEnv` is the whole variable between the two runs. The declared route
 * absences are answered the deployed API's way in BOTH, for the reason the
 * sibling spec gives: a leaf whose route is declared absent would otherwise be a
 * STALE PENDING-DEPLOY failure, which is a different mechanism's finding sitting
 * in this file's population.
 */
function runSweep(extraEnv: Readonly<Record<string, string>>): Promise<Outcome> {
  const child = spawn("bash", [SWEEP, "--profile", "stub", "--strict"], {
    cwd: PACKAGE_ROOT,
    env: {
      ...process.env,
      // `bash <path>`, so the exec bit is not load-bearing.
      NEXUS_BIN: `bash ${STUB}`,
      STUB_ROUTE_MISSING: declaredRouteAbsences,
      ...extraEnv
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
    child.on("close", (status) => resolve({ status: status ?? -1, stdout, stderr }));
  });
}

beforeAll(async () => {
  const universe = await classifyCommandUniverse();
  declaredSkips = universe.expectedSkips;
  declaredRouteAbsences = universe.pendingDeploy
    .map(({ path, route }) => `${path}\t${route}`)
    .join("\n");

  // ANSWERED: no `STUB_SKIP_LEAVES` at all, so every declared skip's leaf comes
  // back as a clean document — the opt-out has lifted, which is the news the
  // mechanism exists to deliver.
  outcomes.set("answered", await runSweep({}));

  // OUTAGE: every declared skip's leaf fails with something that is NOT the
  // policy sentence, which is what a 503 is to `is_policy_refusal`.
  outcomes.set("outage", await runSweep({ STUB_FAIL_LEAVES: declaredSkips.join("\n") }));
}, 900_000);

const outcome = (key: string): Outcome => {
  const o = outcomes.get(key);
  if (o === undefined) throw new Error(`the '${key}' sweep did not run at all`);
  return o;
};

/**
 * THROWS rather than defaulting. `sweep.sh`'s refusals share a number space with
 * its FAIL count — 3 binary unavailable, 4 not authenticated, 5/6/7/10 a
 * derivation failed — so a run that reached no leaf at all prints no summary and
 * must not be scored as a run that counted.
 */
function summaryOf(key: string): string {
  const o = outcome(key);
  const line = /^Summary: .*$/m.exec(o.stdout);
  if (line === null) {
    throw new Error(
      `the '${key}' sweep printed no Summary line, so it REFUSED rather than counting ` +
        `(exit ${o.status}). stderr: ${o.stderr.slice(0, 600)}`
    );
  }
  return line[0];
}

describe("a declaration whose leaf ANSWERED is reported stale", () => {
  it("reaches the leaves at all — the denominator this file's zeros are read against", () => {
    expect(summaryOf("answered")).toMatch(/^Summary: \d+ pass · 0\/\d+ declared skip/);
  });

  it("reports every declared skip as stale, because each one came back clean", () => {
    expect(outcome("answered").stdout).toContain(`STALE declarations (${declaredSkips.length})`);
  });

  it("names the remedy, so the good news is actionable rather than just printed", () => {
    expect(outcome("answered").stdout).toContain("Remove the");
  });
});

describe("🔴 a declaration whose leaf FAILED is NOT reported stale", () => {
  it("reaches the leaves at all — otherwise the zero below is a refusal, not a finding", () => {
    expect(summaryOf("outage")).toMatch(/^Summary: \d+ pass · 0\/\d+ declared skip/);
  });

  it("prints no stale-declaration section whatever, because nothing answered", () => {
    expect(outcome("outage").stdout).not.toContain("STALE declarations");
  });

  it("does not call a wall of failures good news", () => {
    expect(outcome("outage").stdout).not.toContain("This is GOOD NEWS");
  });

  it("still FAILS the run — suppressing the stale report is not suppressing the red", () => {
    // The whole risk of this change is quieting a gate. The declared-skip leaves
    // failed, so `--strict` must still exit non-zero; a 0 here would mean the
    // repair had swallowed the failures along with the false good news.
    expect(outcome("outage").status).toBeGreaterThan(0);
  });

  it("counts those leaves as failures rather than as skips", () => {
    expect(summaryOf("outage")).toContain(`${declaredSkips.length} fail`);
  });
});
