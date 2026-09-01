import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
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
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `sweep()` IS ASYNC ON PURPOSE. NEVER PUT `spawnSync` BACK.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * vitest's worker talks to the main process over birpc, whose call timeout is a
 * HARD-CODED 60000ms with no knob anywhere: `DEFAULT_TIMEOUT = 6e4` in
 * `vitest/dist/chunks/index.B521nVV-.js:3`, armed per call at :56-70 and cleared
 * at :132-138 only when a reply is actually PROCESSED. The one place vitest could
 * inject a different value, `createForksRpcOptions` in
 * `vitest/dist/chunks/utils.CAioKnHs.js:25`, passes serialize/deserialize/post/on
 * and no timeout at all. No config option, no CLI flag, no env var reaches it —
 * `testTimeout`/`hookTimeout` are a different budget and cannot raise or lower it.
 *
 * `spawnSync` blocks this worker's event loop for the child's whole lifetime, so
 * the reply cannot be read while a case runs, and it is UN-YIELDABLE: the usual
 * cure of awaiting a `setImmediate` every so often has nowhere to go inside it.
 * Once this file's cumulative in-worker time passed 60s the run ended
 * `Errors 1 error` / `Timeout calling "onTaskUpdate"` at exit 1 with EVERY test
 * reported PASSED above it — a red no assertion can explain, which reads as a
 * flake and is not one. Measured on this exact file, same code, same cases:
 * 69.38s of `tests` FAILED, 44.18s PASSED.
 *
 * ⚠️ AND THE TIMER WINS THE RACE EVEN THOUGH THE REPLY ARRIVED FIRST. The
 * `onTaskUpdate` calls are fire-and-forget — sent, timer armed, promise parked,
 * and only awaited when the file ends — so nothing forces the loop to turn in
 * between. When it finally does, libuv runs the TIMERS phase before the POLL
 * phase, so the expired timers fire before the replies sitting in the IPC buffer
 * that would have cleared them. The reply is not late; it is merely never read
 * in time.
 *
 * An async `spawn` leaves the loop live between chunks, so the reply is processed
 * and the ceiling is unreachable no matter how many cases this file grows.
 * If you make `sweep()` synchronous again, this file starts failing by WALL CLOCK
 * rather than by assertion, and the failure will not name a test.
 *
 * debt: each case still shells out through `pnpm exec tsx`, and most of a case is
 *       that startup rather than the sweep — measured 5-10s per case on the
 *       Endurance, so this file's wall time scales at roughly 7s x cases. Calling
 *       the tsx binary directly would cut it, at the cost of resolving that binary
 *       ourselves in both a local pnpm workspace and CI, which is a different
 *       change with a different blast radius. It is no longer a CORRECTNESS
 *       ceiling: async `spawn` means a slow file is only slow.
 *       Upgrade trigger: this file passing ~2 minutes on CI, or the CLI step
 *       becoming the critical path of the `Tests: Vitest` job.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "..", "scripts", "id-thread-sweep.ts");
const FIXTURE = join(HERE, "fake-nexus.ts");

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Async on purpose — the file header holds the whole argument. Keep every case
 * `async`, and never reach for `spawnSync` here. */
function sweep(env: Readonly<Record<string, string>>): Promise<Run> {
  return new Promise<Run>((resolve, reject) => {
    const proc = spawn("pnpm", ["exec", "tsx", RUNNER], {
      cwd: join(HERE, "..", ".."),
      env: { ...process.env, NEXUS_BIN: `node ${FIXTURE}`, ...env }
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    // `spawnSync` reported a failure to START as a null status, which this helper
    // then flattened to -1 alongside a genuine signal kill. Rejecting instead means
    // "pnpm is not on PATH" names itself rather than arriving as an exit-code
    // mismatch in whichever case happened to run first.
    proc.on("error", reject);
    // `close` rather than `exit`: it fires once both pipes are drained, so the last
    // chunk of the summary line cannot be lost. `code` is null when a signal killed
    // the child, which is the -1 the assertions already understand.
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** `<n> reached · <n> skipped (<n> no-id, <n> vanished, <n> needs-input) · <n> failed` */
function counts(stdout: string): {
  reached: number;
  noId: number;
  vanished: number;
  needsInput: number;
  failed: number;
} {
  const line =
    /(\d+) reached · (\d+) skipped \((\d+) no-id, (\d+) vanished, (\d+) needs-input\) · (\d+) failed/.exec(
      stdout
    );
  if (line === null) throw new Error(`no summary line in:\n${stdout.slice(-500)}`);
  return {
    reached: Number(line[1]),
    noId: Number(line[3]),
    vanished: Number(line[4]),
    needsInput: Number(line[5]),
    failed: Number(line[6])
  };
}

describe("the id-thread sweep, end to end", () => {
  it("exits 0 and reports what it reached when everything answers", async () => {
    const run = await sweep({ FAKE_MODE: "normal" });
    const summary = counts(run.stdout);

    expect(run.code).toBe(0);
    expect(summary.reached).toBeGreaterThan(0);
    expect(summary.failed).toBe(0);
    // Both skip kinds named separately, never one total.
    expect(summary.noId).toBe(0);
    expect(summary.needsInput).toBe(0);
  }, 60_000);

  it("exits 1 and NAMES the leaf when a route answers with the wrong shape", async () => {
    const run = await sweep({ FAKE_MODE: "badshape" });

    expect(run.code).toBe(1);
    expect(counts(run.stdout).failed).toBe(1);
    expect(run.stdout).toMatch(/^FAILED\s+agent-tool list/m);
  }, 60_000);

  it("exits 7 and SKIPS rather than passing when the id source is empty", async () => {
    // The row that matters most: nothing existed to test with is not a pass,
    // and a run that reached nothing must not report success.
    const run = await sweep({ FAKE_MODE: "empty" });
    const summary = counts(run.stdout);

    expect(run.code).toBe(7);
    expect(summary.reached).toBe(0);
    expect(summary.noId).toBeGreaterThan(0);
    expect(summary.failed).toBe(0);
    expect(run.stderr).toContain("NONE was reached");
    // Every skip names the producer that came back empty.
    expect(run.stdout).toMatch(/^SKIPPED_NO_ID\s+\S+.*returned zero rows/m);
  }, 60_000);

  it("exits 4 and reports NO per-leaf verdicts when the API is unreachable", async () => {
    const run = await sweep({ FAKE_MODE: "unreachable" });

    expect(run.code).toBe(4);
    expect(run.stderr).toContain("not authenticated");
    // A refusal claims nothing about any leaf.
    expect(run.stdout).not.toMatch(/^(REACHED|SKIPPED_NO_ID|SKIPPED_NEEDS_INPUT|FAILED)\s/m);
  }, 60_000);

  it("separates a client-side refusal from a server rejection in ONE run", async () => {
    // Both leaves exit 5. `CLI_INVALID_ARGUMENTS` means nothing was sent, so the
    // route is untested; `VALIDATION_ERROR` means the server refused a complete
    // request, so the route answered badly. A rule that softened every 5 would
    // report two skips and exit 0.
    const run = await sweep({
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

/**
 * THE CONCURRENT-DELETE RACE, ON DEMAND RATHER THAN ON LUCK.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THESE TWO CASES ARE ONE PAIR AND NEITHER IS EVIDENCE ALONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The sweep threads a row its list route published, and `CLI: E2E flows` deletes
 * agents and collections on the same shared organisation while it runs. Four
 * measured `CLI: Sweep` runs: two red with a DIFFERENT id each time, two green -
 * and the green ones had a concurrent E2E run in flight, in its create phase.
 *
 * The cure has to hold BOTH ways, and a test of either half alone passes for a
 * rule that is wrong:
 *
 *   · a rule that softened every `not-found` passes the first case and deletes
 *     the signal the sweep exists for. The second case is what refuses it.
 *   · a rule that never softened one passes the second and leaves the flake. The
 *     first case is what refuses that.
 *
 * The only thing separating them is a second read of the producer, so both cases
 * hand the runner the same exit code and the same document, and differ ONLY in
 * whether the row is still listed.
 */
describe("a row deleted between the list call and the read", () => {
  it("re-threads and REACHES rather than reporting a route that answered correctly", async () => {
    // `agent list` publishes a doomed row once, then never again; any consumer
    // handed it answers `not-found` (4) with a NOT_FOUND document - which is
    // precisely what the live 404s were. Three leaves consume `agentId`.
    const state = mkdtempSync(join(tmpdir(), "id-thread-race-"));
    const run = await sweep({
      FAKE_MODE: "normal",
      FAKE_VANISH_PRODUCERS: "agent list",
      FAKE_STATE_DIR: state
    });
    const summary = counts(run.stdout);

    expect(run.code).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.vanished).toBe(0);
    // The three agentId consumers were re-threaded onto the surviving row and
    // actually invoked - not skipped, not tolerated.
    expect(run.stdout).toMatch(/^REACHED\s+agent-collection list/m);
    expect(run.stdout).toMatch(/^REACHED\s+version list/m);
    expect(run.stdout).toMatch(/^REACHED\s+agent-tool list/m);
  }, 90_000);

  it("reports SKIPPED_ID_VANISHED — not SKIPPED_NO_ID — when the race takes the last row", async () => {
    // 🔴 THE RACE AT FULL STRENGTH, END TO END. The doomed row was the
    // producer's ONLY row, so the re-read that proves the deletion comes back
    // empty — byte-identical to a producer that simply has nothing. Reported as
    // "returned zero rows" this renders as the ordinary skip a reader scrolls
    // past, which is the fifth outcome being hollowed out in the one case it
    // was added for.
    const state = mkdtempSync(join(tmpdir(), "id-thread-race-last-"));
    const run = await sweep({
      FAKE_MODE: "normal",
      FAKE_VANISH_PRODUCERS: "agent list",
      FAKE_VANISH_LEAVES_NOTHING: "1",
      FAKE_STATE_DIR: state
    });
    const summary = counts(run.stdout);

    // Three leaves take `agentId`, and none of them may be called a no-id skip.
    expect(summary.vanished).toBe(3);
    expect(summary.failed).toBe(0);
    expect(run.stdout).toMatch(/^SKIPPED_ID_VANISHED\s+agent-collection list/m);
    expect(run.stdout).toMatch(/^SKIPPED_ID_VANISHED\s+version list/m);
    // The whole point: this row is NOT the one that says "returned zero rows".
    expect(run.stdout).not.toMatch(/^SKIPPED_NO_ID\s+agent-collection list/m);
    // Other producers are untouched, so the run still reaches things.
    expect(summary.reached).toBeGreaterThan(0);
  }, 90_000);

  it("still FAILS on a not-found whose row its own producer is still listing", async () => {
    // The negative control, and the whole reason the cure is a second READ and
    // not a tolerance. Same exit code, same document, same category - and the
    // row never vanishes, so nothing may retire the red.
    const run = await sweep({
      FAKE_MODE: "normal",
      FAKE_REFUSE_LEAVES: "collection get:4:NOT_FOUND"
    });
    const summary = counts(run.stdout);

    expect(run.code).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.vanished).toBe(0);
    // ANCHORED to the leaf's own row rather than searched for anywhere in the
    // output. The note ends in a slice of a PRETTY-PRINTED error document, so a
    // free substring assertion would pass with the discriminator buried several
    // lines below the row a reader actually scans - which is where it landed
    // before it was moved to the front.
    expect(run.stdout).toMatch(
      /^FAILED\s+collection get\s+\[the id is STILL listed by its producer/m
    );
  }, 90_000);
});

/**
 * A RE-READ THAT CANNOT BE PARSED IS EVIDENCE OF NOTHING — AND MUST NOT BLANK
 * EVERY LATER LEAF.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS THE SAME DEFECT THE PR EXISTS TO PREVENT, ARRIVING THROUGH THE CURE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `refreshProducers` stores a re-read into `bodyOf`, which is SHARED by every
 * leaf. Gating that write on the exit code alone lets a route answering 200 with
 * an error page replace a good stored list — and then later leaves that never
 * saw a not-found at all report `SKIPPED_NO_ID`, "returned zero rows", about a
 * producer whose good list this run is still holding.
 *
 * That is the exact substitution the fifth outcome was added to refuse, so a
 * test that only covers the vanish path leaves the same lie reachable one branch
 * over. The discriminator is `rowsFrom`: "parsed, and empty" PROVES the row is
 * gone, "did not parse" proves nothing.
 */
describe("a producer re-read that comes back unreadable", () => {
  it("keeps the stored list instead of reporting later leaves as zero rows", async () => {
    // `agent list` publishes the doomed row once, so a consumer threads it and
    // gets a not-found — and the re-read that not-found triggers answers exit 0
    // with an error page. Three leaves consume `agentId`.
    const state = mkdtempSync(join(tmpdir(), "id-thread-unreadable-"));
    const run = await sweep({
      FAKE_MODE: "normal",
      FAKE_VANISH_PRODUCERS: "agent list",
      FAKE_UNREADABLE_REREAD: "agent list",
      FAKE_STATE_DIR: state
    });
    const summary = counts(run.stdout);

    // 🔴 THE WHOLE ASSERTION. Nothing here may be called an empty producer: the
    // run holds `agent list`'s good body and never stopped holding it.
    expect(summary.noId).toBe(0);

    // ANCHORED per leaf rather than a free search for "returned zero rows" — the
    // notes carry pretty-printed error documents, so an unanchored negative can
    // pass for the wrong reason.
    expect(run.stdout).not.toMatch(/^SKIPPED_NO_ID\s+agent-collection list/m);
    expect(run.stdout).not.toMatch(/^SKIPPED_NO_ID\s+version list/m);
    expect(run.stdout).not.toMatch(/^SKIPPED_NO_ID\s+agent-tool list/m);

    // The re-read measured NOTHING, so the not-found is NOT retired into a race.
    // It stands as a failure, which is the conservative half of the same rule.
    expect(summary.vanished).toBe(0);
    expect(run.stdout).toMatch(/^FAILED\s+agent-collection list/m);
    expect(run.stdout).toMatch(/^FAILED\s+version list/m);
    expect(run.stdout).toMatch(/^FAILED\s+agent-tool list/m);
  }, 90_000);
});
