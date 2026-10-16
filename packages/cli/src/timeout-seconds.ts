/**
 * THE SECONDS/MILLISECONDS BOUNDARY, AND THE ONE PLACE IT IS CROSSED.
 *
 * No `commander` and no SDK here on purpose: this is arithmetic plus a brand,
 * and `timeout-flag.ts` is the only part that needs the CLI framework.
 */

/**
 * A number that has been STATED to be in seconds.
 *
 * `createClient`'s timeout is seconds and every transport under it is
 * milliseconds. Both are `number`, so nothing stopped a constant named
 * `PROMPT_ASSISTANT_TIMEOUT_MS` crossing that boundary — it was multiplied by
 * 1000 a second time, overflowed Node's 32-bit timer, and aborted every
 * request instantly (NEX-3707). The docblock saying SECONDS was already there
 * and was already right; a docblock is not a check.
 *
 * The brand makes the unit part of the TYPE, so a plain millisecond number can
 * no longer be passed where seconds are expected. It fires in the editor,
 * which matters more than a CI gate here: the branch that reproduced this
 * defect four times over is months behind staging and its author will meet the
 * error at the line rather than after a push.
 *
 * A brand cannot be constructed by accident — `seconds()` is the only way in,
 * and calling it is the moment somebody states the unit out loud.
 */
export type Seconds = number & { readonly __brand: unique symbol };

/**
 * State that a number is in seconds.
 *
 * Deliberately unvalidated beyond finiteness: `secondsToMs` owns the range
 * refusal, and duplicating it here would put two ceilings in the code that
 * could disagree.
 */
export function seconds(value: number): Seconds {
  return value as Seconds;
}

/**
 * The largest delay Node's timers accept: 2^31 - 1 ms, about 24.8 days.
 *
 * Every timeout this CLI builds ends in `setTimeout(() => controller.abort(),
 * ms)` — in the SDK's `HttpClient` and in the vibe tenant transport. Node
 * CLAMPS a delay above this ceiling **to 1 ms**, warning only with a
 * `TimeoutOverflowWarning` on stderr. So an overlong timer does not wait
 * longer than intended; it aborts the request immediately, before it leaves
 * the machine, and reports itself as a timeout after the number of seconds it
 * never waited.
 */
export const MAX_TIMEOUT_MS = 2_147_483_647;

/** The same ceiling in the unit `--timeout` speaks. */
export const MAX_TIMEOUT_SECONDS = Math.floor(MAX_TIMEOUT_MS / 1000);

/**
 * Convert SECONDS to milliseconds. This is the one place the unit changes, so
 * it is where an out-of-range value is REFUSED rather than left to Node's
 * silent clamp-to-1ms. A value already in milliseconds is the way this goes
 * wrong: it is multiplied by 1000 a second time, overflows, and every request
 * aborts instantly (NEX-3707). Refusing is louder than clamping — a clamp to
 * 24.8 days is indistinguishable from working.
 *
 * Takes a DEFINED number and returns one, for a caller that has already
 * chosen its value and needs the milliseconds as a number — a deadline it
 * keeps itself. `timeoutSecondsToMs` is the same conversion for an optional
 * flag value.
 */
export function secondsToMs(seconds: number): number {
  const ms = seconds * 1000;
  if (!Number.isFinite(ms) || ms > MAX_TIMEOUT_MS) {
    throw new RangeError(
      `Timeout of ${seconds}s is ${ms} ms, past the ${MAX_TIMEOUT_MS} ms ceiling Node's timers ` +
        `accept. Pass at most ${MAX_TIMEOUT_SECONDS} seconds. A value this large is usually ` +
        `milliseconds handed to a parameter that takes seconds.`
    );
  }
  return ms;
}

/**
 * Convert a timeout expressed in SECONDS to the milliseconds the HTTP clients
 * expect. Every command path that builds its own client (SDK client, raw
 * `nexus api` HttpClient, vibe tenant transport) converts through here, so the
 * global `--timeout <seconds>` flag and every command's own default mean the
 * same thing everywhere. An unset flag stays unset, so the receiver applies
 * its own default.
 */
export function timeoutSecondsToMs(seconds: number | undefined): number | undefined {
  return seconds === undefined ? undefined : secondsToMs(seconds);
}
