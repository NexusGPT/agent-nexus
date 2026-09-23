import { describe, expect, it } from "vitest";

import { pollForTerminalState, type PollReading } from "./poll-for-terminal-state";

/**
 * Every arm here was written against the loop and then SCORED by breaking the
 * loop and watching it red — the mutants are named in each case, because an arm
 * nobody has seen fail is a claim about coverage rather than coverage.
 *
 * One property per `it` on purpose. A failing assertion throws and aborts the
 * rest of its own block, so two arms in one block means a mutant scores exactly
 * one of them — whichever is written first — and the other is unscored while
 * the block still reads red.
 */

const reading = <T>(value: T, terminal: boolean): PollReading<T> => ({ value, terminal });

describe("pollForTerminalState — the clock, and nothing else", () => {
  it("stops at the first terminal reading and probes no further", async () => {
    let probes = 0;
    const result = await pollForTerminalState(
      { budgetMs: 10_000, intervalMs: 1 },
      async () => {
        probes += 1;
        return reading(`look-${probes}`, probes === 2);
      },
      "swallow"
    );

    // MUTANT: drop `if (reading.terminal) return reading;` -> probes runs away
    // and the budget, not the verdict, ends the poll.
    expect(probes).toBe(2);
    expect(result).toEqual({ value: "look-2", terminal: true });
  });

  it("carries the LATEST non-terminal reading out when the budget expires", async () => {
    let last = "";
    const result = await pollForTerminalState(
      { budgetMs: 25, intervalMs: 1 },
      async () => {
        last = `look-${Date.now()}-${Math.random()}`;
        return reading(last, false);
      },
      "swallow"
    );

    // MUTANT: `return undefined` instead of `return latest` -> a caller can no
    // longer tell "still pending" from "never got an answer at all".
    expect(result).toEqual({ value: last, terminal: false });
  });

  it("returns undefined when no probe ever produced a reading", async () => {
    const result = await pollForTerminalState(
      { budgetMs: 25, intervalMs: 1 },
      async () => undefined,
      "swallow"
    );

    // MUTANT: seed `latest` with anything -> an absent row reports as a status.
    expect(result).toBeUndefined();
  });

  it("does NOT let an undefined reading erase the last real one", async () => {
    let probes = 0;
    const result = await pollForTerminalState(
      { budgetMs: 40, intervalMs: 1 },
      async () => {
        probes += 1;
        return probes === 1 ? reading("seen-once", false) : undefined;
      },
      "swallow"
    );

    // MUTANT: `latest = reading` before the undefined guard -> the row is seen,
    // then forgotten, and the command reports nothing was ever observed.
    expect(result).toEqual({ value: "seen-once", terminal: false });
  });

  it("swallow: a throwing probe does not end the poll", async () => {
    let probes = 0;
    const result = await pollForTerminalState(
      { budgetMs: 10_000, intervalMs: 1 },
      async () => {
        probes += 1;
        if (probes < 3) throw new Error("transient");
        return reading("recovered", true);
      },
      "swallow"
    );

    // MUTANT: rethrow regardless of policy -> `create --submit` turns a
    // successful create into a non-zero exit on one flaky list call.
    expect(result).toEqual({ value: "recovered", terminal: true });
  });

  it("propagate: a throwing probe ends the poll and the error reaches the caller", async () => {
    const boom = new Error("list failed");

    // MUTANT: swallow regardless of policy -> `submit-approval --wait` reports a
    // pending status it never actually observed.
    await expect(
      pollForTerminalState(
        { budgetMs: 10_000, intervalMs: 1 },
        async () => {
          throw boom;
        },
        "propagate"
      )
    ).rejects.toBe(boom);
  });

  it("probes ZERO times when the budget is already spent", async () => {
    let probes = 0;
    const result = await pollForTerminalState(
      { budgetMs: 0, intervalMs: 1 },
      async () => {
        probes += 1;
        return reading("never", true);
      },
      "swallow"
    );

    // MUTANT: a do/while, or testing the budget after the probe -> a zero budget
    // still costs one billed round trip.
    expect(probes).toBe(0);
    expect(result).toBeUndefined();
  });

  it("waits the interval BEFORE the first probe, never after it", async () => {
    let firstProbeAt = -1;
    const startedAt = Date.now();

    await pollForTerminalState(
      { budgetMs: 10, intervalMs: 60 },
      async () => {
        if (firstProbeAt < 0) firstProbeAt = Date.now() - startedAt;
        return reading("late", false);
      },
      "swallow"
    );

    // MUTANT: move the sleep to the END of the loop body -> the first probe
    // fires at t≈0 and every caller reads a status an interval earlier than its
    // help text says. A probe COUNT cannot see that move; the timestamp can.
    expect(firstProbeAt).toBeGreaterThanOrEqual(50);
  });

  it("lets one probe outlive the budget — the floor-not-ceiling property", async () => {
    let probes = 0;

    await pollForTerminalState(
      { budgetMs: 10, intervalMs: 60 },
      async () => {
        probes += 1;
        return reading("late", false);
      },
      "swallow"
    );

    // The warning in the header, pinned: a 10 ms budget with a 60 ms interval
    // still costs exactly one round trip, and the call returns long after the
    // budget is gone. Callers quoting a wall-clock promise are quoting this.
    //
    // MUTANT: test the budget again after the sleep -> probes becomes 0 and the
    // documented behaviour every channel poll relies on is gone.
    expect(probes).toBe(1);
  });
});
