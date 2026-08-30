import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * THE FOUR-OUTCOME CONTRACT, END TO END, THROUGH THE REAL RUNNER.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 WHY THIS FILE EXISTS: THE FIXTURE RAN NOWHERE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `fake-nexus.ts` beside this file was written to prove the sweep's reporting,
 * and NOTHING IMPORTED OR SPAWNED IT. Vitest collects `test/**\/*.test.ts`, so a
 * bare fixture is never run. Every exit code this lane claimed — 0, 1, 4, 7, the
 * 4-and-7 rows, the refusal-vs-rejection split — was produced by a human typing
 * a command, and none of it was protected by anything.
 *
 * ⚠️ AND THAT WENT UNNOTICED BECAUSE THE PERSON CHECKING IT WAS THE PERSON
 * RUNNING IT. An instrument you drive by hand feels exercised precisely because
 * you keep exercising it. This is the same defect that put the refusal parser in
 * `scripts/` and the outcome mapping inside a file ending in `main()` — the
 * third instance in one change, each one level further out.
 *
 * ── WHAT IS HERE AND WHAT IS IN THE UNIT SPEC ───────────────────────────────
 *
 * The disposition MAPPING is exhaustively covered in `src/id-graph.outcome.test.ts`
 * over the whole exit taxonomy, in microseconds. This file covers what a pure
 * function cannot: that the runner is WIRED to it, that the process exit codes
 * are what the contract says, and that the counts reach the report.
 *
 * Each case spawns the real sweep against the fake binary — about 3.4s, and 0.7s
 * for the preflight case, which refuses before running any leaf.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "..", "scripts", "id-thread-sweep.ts");
const FIXTURE = join(HERE, "fake-nexus.ts");

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function sweep(env: Readonly<Record<string, string>>): Run {
  const proc = spawnSync("pnpm", ["exec", "tsx", RUNNER], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    cwd: join(HERE, "..", ".."),
    env: { ...process.env, NEXUS_BIN: `node ${FIXTURE}`, ...env }
  });
  return { code: proc.status ?? -1, stdout: proc.stdout ?? "", stderr: proc.stderr ?? "" };
}

/** `<n> reached · <n> skipped (<n> no-id, <n> needs-input) · <n> failed` */
function counts(stdout: string): {
  reached: number;
  noId: number;
  needsInput: number;
  failed: number;
} {
  const line =
    /(\d+) reached · (\d+) skipped \((\d+) no-id, (\d+) needs-input\) · (\d+) failed/.exec(stdout);
  if (line === null) throw new Error(`no summary line in:\n${stdout.slice(-500)}`);
  return {
    reached: Number(line[1]),
    noId: Number(line[3]),
    needsInput: Number(line[4]),
    failed: Number(line[5])
  };
}

describe("the id-thread sweep, end to end", () => {
  it("exits 0 and reports what it reached when everything answers", () => {
    const run = sweep({ FAKE_MODE: "normal" });
    const summary = counts(run.stdout);

    expect(run.code).toBe(0);
    expect(summary.reached).toBeGreaterThan(0);
    expect(summary.failed).toBe(0);
    // Both skip kinds named separately, never one total.
    expect(summary.noId).toBe(0);
    expect(summary.needsInput).toBe(0);
  }, 60_000);

  it("exits 1 and NAMES the leaf when a route answers with the wrong shape", () => {
    const run = sweep({ FAKE_MODE: "badshape" });

    expect(run.code).toBe(1);
    expect(counts(run.stdout).failed).toBe(1);
    expect(run.stdout).toMatch(/^FAILED\s+agent-tool list/m);
  }, 60_000);

  it("exits 7 and SKIPS rather than passing when the id source is empty", () => {
    // The row that matters most: nothing existed to test with is not a pass,
    // and a run that reached nothing must not report success.
    const run = sweep({ FAKE_MODE: "empty" });
    const summary = counts(run.stdout);

    expect(run.code).toBe(7);
    expect(summary.reached).toBe(0);
    expect(summary.noId).toBeGreaterThan(0);
    expect(summary.failed).toBe(0);
    expect(run.stderr).toContain("NONE was reached");
    // Every skip names the producer that came back empty.
    expect(run.stdout).toMatch(/^SKIPPED_NO_ID\s+\S+.*returned zero rows/m);
  }, 60_000);

  it("exits 4 and reports NO per-leaf verdicts when the API is unreachable", () => {
    const run = sweep({ FAKE_MODE: "unreachable" });

    expect(run.code).toBe(4);
    expect(run.stderr).toContain("not authenticated");
    // A refusal claims nothing about any leaf.
    expect(run.stdout).not.toMatch(/^(REACHED|SKIPPED_NO_ID|SKIPPED_NEEDS_INPUT|FAILED)\s/m);
  }, 60_000);

  it("separates a client-side refusal from a server rejection in ONE run", () => {
    // Both leaves exit 5. `CLI_INVALID_ARGUMENTS` means nothing was sent, so the
    // route is untested; `VALIDATION_ERROR` means the server refused a complete
    // request, so the route answered badly. A rule that softened every 5 would
    // report two skips and exit 0.
    const run = sweep({
      FAKE_MODE: "normal",
      FAKE_REFUSE_LEAVES: "asset get:5:CLI_INVALID_ARGUMENTS,collection get:5:VALIDATION_ERROR"
    });
    const summary = counts(run.stdout);

    expect(run.code).toBe(1);
    expect(summary.needsInput).toBe(1);
    expect(summary.failed).toBe(1);
    expect(run.stdout).toMatch(/^SKIPPED_NEEDS_INPUT\s+asset get/m);
    expect(run.stdout).toMatch(/^FAILED\s+collection get/m);
  }, 60_000);
});
