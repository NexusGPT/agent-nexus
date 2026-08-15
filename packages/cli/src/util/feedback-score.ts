import { InvalidArgumentError } from "commander";

/**
 * `analytics feedback --score` — a 0-to-1 SCALE, parsed as a real number.
 *
 * ── The defect this replaces ─────────────────────────────────────────────────
 *
 * The flag was bound to bare `parseInt`, and the route's filter is
 * `z.coerce.number().min(0).max(1)` (`analytics.schemas.ts`). Those two do not
 * overlap on anything but `0` and `1`, and the mismatch is SILENT in the
 * direction that returns rows:
 *
 *   --score 0.5  ->  parseInt("0.5") === 0  ->  the server filters on 0
 *   --score 0.7  ->  parseInt("0.7") === 0  ->  the server filters on 0
 *
 * Both were measured against commander, not read off the source. The caller
 * asked for one score, got the rows of a DIFFERENT one, and nothing anywhere
 * reported a problem — the answer is wrong and it looks exactly like a right
 * one. That is strictly worse than the other half of the same mismatch,
 * `--score 5`, which at least comes back as a 400.
 *
 * ── Why refuse out of range here rather than let the server do it ────────────
 *
 * The server already refuses `5`, so a local check adds no safety there — it
 * adds the MESSAGE. Commander names the flag and the value it rejected before a
 * request is built, where a 400 arrives after the round trip carrying the
 * route's vocabulary rather than the flag's. `booleanFlag` and
 * `parseTimePeriod` are the house precedent: refuse at PARSE time, in
 * commander's own error format.
 *
 * The bound is the contract's, not a guess. Widen it here and the flag starts
 * sending values the route refuses again.
 */
export function parseFeedbackScore(raw: string): number {
  const trimmed = raw.trim();
  const value = Number(trimmed);

  // `Number("")` is 0, not NaN — so an empty value would pass the range check
  // below and filter on the thumbs-down score nobody asked for. The emptiness
  // has to be refused before the number is read, never after.
  if (trimmed === "" || !Number.isFinite(value)) {
    throw new InvalidArgumentError(`expected a number between 0 and 1, got "${raw}".`);
  }
  if (value < 0 || value > 1) {
    throw new InvalidArgumentError(
      `expected a score between 0 and 1, got "${raw}". Feedback is scored on a ` +
        `0-to-1 scale, not 1-5, and a value outside it is refused by the route.`
    );
  }

  return value;
}
