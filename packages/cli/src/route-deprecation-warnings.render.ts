import type { DeprecationNotice } from "@agent-nexus/sdk";

/**
 * A ROUTE-RETIREMENT NOTICE, AS THE WORDS A READER ACTS ON.
 *
 * Split out of `./route-deprecation-warnings.ts`, which holds the orientation
 * argument for this whole concern — including why it is not the CLI's own
 * command-deprecation machinery — and the observer the SDK is handed. Nothing
 * here touches a stream or the environment: given a notice it returns strings,
 * and `./route-deprecation-warnings.report.ts` is what prints them.
 *
 * Its own file because the sign-of-zero rule in {@link remaining} is this
 * concern's subtlest logic, and the arms that pin both sides of that zero
 * deserve somewhere obvious to sit.
 */

/**
 * The route, as a reader recognises it: method and path, no origin and no query.
 *
 * The query is dropped because it is noise in a warning and can carry a filter
 * value the user did not ask to see echoed; the origin because it is the same on
 * every line of a given run. A URL this cannot parse degrades to the raw string
 * rather than throwing — an observer must not be able to fail the request that
 * produced it.
 */
export function routeOf(notice: DeprecationNotice): string {
  try {
    return `${notice.method} ${new URL(notice.url).pathname}`;
  } catch {
    return `${notice.method} ${notice.url}`;
  }
}

const DAY_MS = 86_400_000;

/**
 * How much time is left, in the words a reader needs.
 *
 * Derived from the PARSED date, so it is absent whenever the parse failed — in
 * which case the raw value is still printed on its own line and the reader can
 * see the date this could not read. Saying "in 0 days" over an unparseable
 * header would be a number invented by the client.
 *
 * 🔴 THE SIGN OF THE RAW DELTA DECIDES WHICH SIDE WE ARE ON — NEVER A TRUNCATED
 * DAY COUNT. `Math.trunc` collapses toward zero from BOTH directions, so a day
 * count of `0` is two opposite facts wearing one number: a sunset twelve hours
 * away, and a sunset that passed eleven hours ago. This function used to read
 * that single `0` as "within 24 hours", which announced a route whose stated
 * sunset had ALREADY ELAPSED as though it were still live — the reassuring
 * direction, in the one branch nobody tests, inside the fix whose entire thesis
 * is that an instrument which cannot express the bad news is not a control.
 * Found by review on #7872; the arms for both sides of zero are what keep it
 * closed.
 *
 * So: branch on `ms` first, and only then count whole days WITHIN the side we
 * already know we are on.
 *
 * `ms === 0` is ELAPSED on purpose. RFC 8594's `Sunset` is the instant the
 * resource is expected to stop responding, so at exactly that instant the
 * deadline has arrived — and of the two readings available, "it may already be
 * gone" is the one that costs a user nothing if it is early, while "you have 24
 * hours" costs them the outage.
 *
 * Whole days are still truncated toward zero WITHIN a side, so "in 1 day" can
 * mean 1.9 days and "1 day ago" can mean 1.9 days ago. That is a magnitude
 * rounding, not a direction error: both sentences name the correct side of the
 * deadline, which is the part a reader acts on.
 */
export function remaining(sunsetAt: Date, now: Date): string {
  const ms = sunsetAt.getTime() - now.getTime();

  if (ms <= 0) {
    const elapsed = Math.trunc(-ms / DAY_MS);
    if (elapsed === 0) return "less than a day ago — this route may already be gone";
    if (elapsed === 1) return "1 day ago — this route may already be gone";
    return `${elapsed} days ago — this route may already be gone`;
  }

  const days = Math.trunc(ms / DAY_MS);
  if (days === 0) return "within 24 hours";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}
