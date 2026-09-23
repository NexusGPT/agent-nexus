/**
 * A BOUNDED POLL FOR A STATE THAT CHANGES SOMEWHERE ELSE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS IS NOT EITHER DEADLINE IN THIS DIRECTORY, AND IT IS NOT A NEAR MISS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   · `request-deadline.ts` bounds ONE request — its headers AND its body.
 *   · `stall-deadline.ts`   bounds SILENCE inside one transfer, re-armed per chunk.
 *
 * Both are about a single exchange that is already in flight, and both have
 * something to abort. This is about a SEQUENCE of exchanges that each completed
 * successfully: Meta's template review and Twilio's delivery both finish long
 * after the request that started them returned 200, so the only way to learn the
 * verdict is to ask again on a timer until it arrives or the budget runs out.
 * There is nothing to abort — each probe already finished — so neither deadline
 * above can express this, and converging them would be a category error.
 *
 * 🚨 THE BUDGET IS TESTED BETWEEN PROBES AND NEVER DURING ONE, SO IT IS A FLOOR
 *    ON THE RUNNING TIME RATHER THAN A CEILING ON IT. A probe already in flight
 *    when the budget expires still runs to completion, and what bounds THAT is
 *    the SDK's own per-request deadline — `DEFAULT_REQUEST_TIMEOUT_MS` is 30 s
 *    and `DEFAULT_MAX_RETRIES` is 2, so one round trip can outlive a 30 s budget
 *    on its own. A caller that documents a wall-clock promise to an operator
 *    cannot keep it with this alone.
 *
 * debt: the budget bounds the number of probes started, not the wall clock.
 *       Ceiling: overshoot is one probe, so worst case is
 *       budgetMs + (SDK request timeout x (1 + maxRetries)) + backoff.
 *       Upgrade trigger: a caller needs a HARD wall-clock bound — then the probe
 *       itself has to carry a deadline derived from the budget remaining, which
 *       is a change to every probe's signature rather than to this loop.
 */

/** The clock a poll runs on: how long it may keep asking, and how often. */
export interface PollWindow {
  /**
   * Total elapsed budget, tested BETWEEN probes. MILLISECONDS.
   *
   * See the floor-not-ceiling warning above before quoting this to an operator.
   */
  readonly budgetMs: number;
  /** How long to wait before EACH probe, the first one included. MILLISECONDS. */
  readonly intervalMs: number;
}

/**
 * One reading taken by a probe.
 *
 * A non-terminal reading is still carried out of the poll, because every caller
 * here wants the last thing it saw even when nothing resolved — "still pending
 * after 2m" is a different report from "never got an answer at all", and only
 * the latest reading separates them.
 */
export interface PollReading<T> {
  readonly value: T;
  /** Stop now; this is the answer. */
  readonly terminal: boolean;
}

/**
 * What to do when a probe THROWS.
 *
 * Deliberately a required argument with no default. The two behaviours are a
 * real disagreement between existing callers rather than an oversight, and a
 * default would let the next caller inherit one of them without deciding:
 *
 *   · `swallow`   — a transient read failure is not a verdict, so keep asking
 *                   until the budget runs out. The risk is that a persistent
 *                   failure reads as "still pending".
 *   · `propagate` — the caller has already done something irreversible and wants
 *                   to report the read failure against it rather than report a
 *                   pending status it never actually observed.
 */
export type ProbeFailurePolicy = "swallow" | "propagate";

/**
 * Ask `probe` every `window.intervalMs` until it reports a terminal reading or
 * `window.budgetMs` elapses.
 *
 * Returns the terminal reading, or the last non-terminal one, or `undefined`
 * when no probe ever produced a reading. The caller decides what each of those
 * three means — this loop owns the clock and nothing else.
 */
export async function pollForTerminalState<T>(
  window: PollWindow,
  probe: () => Promise<PollReading<T> | undefined>,
  onProbeFailure: ProbeFailurePolicy
): Promise<PollReading<T> | undefined> {
  const startedAt = Date.now();
  let latest: PollReading<T> | undefined;

  while (Date.now() - startedAt < window.budgetMs) {
    await new Promise((resolve) => setTimeout(resolve, window.intervalMs));

    try {
      const reading = await probe();
      if (reading === undefined) continue;
      latest = reading;
      if (reading.terminal) return reading;
    } catch (error) {
      if (onProbeFailure === "propagate") throw error;
    }
  }

  return latest;
}
