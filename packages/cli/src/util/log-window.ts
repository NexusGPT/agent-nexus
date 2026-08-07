/**
 * `--since` / `--until` → the epoch-millisecond window the log endpoints take.
 *
 * Its own module, and pure, for one reason: a window resolver that reads the
 * clock itself cannot be tested without freezing one. `now` is a parameter, so
 * every assertion below is a comparison between two numbers the test chose.
 *
 * Two spellings are accepted and they are deliberately distinguishable by shape
 * rather than by trying both and seeing what sticks:
 *
 *   - a RELATIVE duration — `45s`, `30m`, `1h`, `2d` — meaning "that long before
 *     `now`". This is what a terminal user types.
 *   - an ABSOLUTE instant, ISO-8601, recognised by beginning `YYYY-MM-DD`.
 *
 * `Date.parse` is not used as the fallback for everything, because it accepts
 * far more than ISO-8601 and accepts it silently: `Date.parse("2026")` is a
 * valid date (the year), so a typo'd duration would resolve to a window in the
 * distant past rather than being refused. The date prefix is checked FIRST and
 * anything that does not match either shape is an error naming both.
 */

/** `<n><unit>`, e.g. `90m`. Anchored, so `1h30m` is refused rather than half-read. */
const RELATIVE_DURATION = /^(\d+)(s|m|h|d)$/;

/** An ISO-8601 instant must at least begin with a calendar date. */
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
};

/**
 * The widest window the log endpoints will answer, in milliseconds.
 *
 * Mirrors `VIBE_LOG_GATEWAY_MAX_RANGE_MS`. ⚠️ This one value is checked by
 * READING, not by a gate: that constant is declared as `7 * 24 * 60 * 60 * 1000`,
 * a computed expression, so TypeScript infers `number` rather than a literal
 * type and there is nothing for `vibe-wire-types.conformance.ts` to compare. The
 * two ceilings it CAN compare — the line limit and the `contains` length — are
 * gated there.
 *
 * The consequence of drift here is a round trip, not a wrong answer: the server
 * refuses the window independently, with its own message.
 */
export const VIBE_LOG_MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface LogWindow {
  /** Inclusive start, epoch milliseconds. */
  from: number;
  /** Exclusive end, epoch milliseconds. */
  to: number;
}

/**
 * Resolve one `--since` / `--until` pair against a caller-supplied `now`.
 *
 * `until` absent means "up to now", which is what makes `--since 1h` on its own
 * mean the last hour rather than an hour-wide window starting an hour ago.
 */
export function resolveLogWindow(since: string, until: string | undefined, now: number): LogWindow {
  const from = parseLogInstant(since, now, "--since");
  const to = until === undefined ? now : parseLogInstant(until, now, "--until");

  if (from >= to) {
    throw new Error(
      `--since must resolve to an instant strictly before --until (got ${new Date(from).toISOString()} and ${new Date(to).toISOString()}).`
    );
  }

  // `<=`, matching the server's own `to - from <= VIBE_LOG_GATEWAY_MAX_RANGE_MS`
  // exactly. A stricter local `<` would refuse a request the server accepts —
  // an exactly-7-day window — which is the one direction a client-side bound
  // must never take.
  if (to - from > VIBE_LOG_MAX_RANGE_MS) {
    throw new Error("The queried window must not exceed 7 days.");
  }

  return { from, to };
}

/**
 * One `--since`/`--until` value as an epoch-millisecond instant.
 *
 * `flag` is carried only so the message names the flag the user actually typed;
 * both flags accept exactly the same grammar.
 */
export function parseLogInstant(raw: string, now: number, flag: string): number {
  const value = raw.trim();

  const relative = RELATIVE_DURATION.exec(value);
  if (relative !== null) {
    const amount = Number(relative[1]);
    const unitMs = UNIT_MS[relative[2]];
    // Unreachable while the regex and UNIT_MS agree; asserted rather than
    // asserted-away, because a unit added to one and not the other would
    // otherwise resolve to NaN and read as "the epoch".
    if (unitMs === undefined)
      throw new Error(`${flag}: unsupported duration unit "${relative[2]}".`);
    return now - amount * unitMs;
  }

  if (ISO_DATE_PREFIX.test(value)) {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      throw new Error(`${flag}: "${raw}" starts like an ISO-8601 instant but is not one.`);
    }
    return parsed;
  }

  throw new Error(
    `${flag}: "${raw}" is neither a duration (45s, 30m, 1h, 2d) nor an ISO-8601 instant (2026-08-06T09:00:00Z).`
  );
}
