import { describe, expect, it } from "vitest";

/**
 * THE REPOSITORY'S EVENT-LOOP STALL GUARD RUNS IN THIS PACKAGE'S WORKERS.
 *
 * `vitest.config.ts` lists `scripts/test-runner/event-loop-stall-guard.setup.ts`
 * in `setupFiles`. A wrong path, a dropped line or a config that stopped being
 * the one `pnpm test` loads would leave every spec here green and the guard off —
 * and the defect it exists for is a red that names no file, so its absence would
 * be found the next time a run ends `Timeout calling "onTaskUpdate"`. These arms
 * are what make the wiring a fact rather than a line in a config.
 *
 * The guard's own behaviour — the hold arithmetic, the refusal, the CPU bound —
 * is proven by `scripts/__tests__/event-loop-stall-guard.spec.ts` against the same
 * module. What is proven HERE is only that this package's run installs it.
 *
 * The marker is read by its registered symbol rather than imported: importing
 * `scripts/test-runner/` would pull it into this package's tsc programs, which
 * compile under this package's settings, not the scripts'.
 */
const STALL_GUARD_INSTALLED = Symbol.for("nexus.event-loop-stall-guard");

describe("the event-loop stall guard is installed, and yielding, in this worker", () => {
  it("left its marker here, with the bound it enforces", () => {
    // 20000 ms is a third of vitest's 60000 ms RPC timeout, and 5000 a quarter of
    // that; `scripts/test-runner/event-loop-stall-budget.ts` derives both and its
    // own spec pins them to the installed vitest.
    expect(Reflect.get(globalThis, STALL_GUARD_INSTALLED)).toEqual({
      boundCpuMs: 20_000,
      warnCpuMs: 5_000
    });
  });

  // A pair, and their ORDER is the assertion. The first queues an immediate and
  // returns synchronously; the second is synchronous too, so the immediate has run
  // by the time it reads only if the loop TURNED between the two tests — which
  // vitest's runner does not do on its own, and which is the whole cure.
  let turnedBetweenTests = false;

  it("queues an immediate and returns without awaiting it", () => {
    setImmediate(() => {
      turnedBetweenTests = true;
    });
    expect(turnedBetweenTests).toBe(false);
  });

  it("sees it ran — the loop turned between the two tests", () => {
    expect(turnedBetweenTests).toBe(true);
  });
});
