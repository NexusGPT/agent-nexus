import type { MountSession } from "./mount-session";
import type { FailedRefresh } from "./refresh-record";

/**
 * After a failed refresh the helper refuses for this long WITHOUT calling the
 * backend. Every Finder poll on a broken mount reruns the helper, and each run
 * that reached the server would be one POST — a listing of a hundred files
 * would be a hundred mints against a key that has already been refused once.
 */
export const REFRESH_COOLDOWN_MS = 30 * 1000;

/**
 * The failure the helper is still cooling down from, or null once it may ask
 * the backend again. Anchored on the failure's own time and never on a
 * refusal's: a refusal that re-stamped the clock would let a Finder poll extend
 * the cooldown for as long as the polling lasts. A failure stamped in the
 * FUTURE — the clock was stepped back since — does not cool down either: the
 * window would otherwise last until the clock caught up with the stamp.
 *
 * 🔴 An UNPARSEABLE stamp cools down. `isMountSession` checks `at` is a string
 * and not that it is an instant, so a damaged file yields `NaN`, and every
 * comparison against `NaN` is false — which would have returned null and opened
 * the gate this function exists to close. On a broken mount that is one mint per
 * Finder poll: a hundred-file listing becomes a hundred POSTs against a key that
 * was already refused. The unknown age is treated as "inside the window".
 */
export function refreshCooldownFailure(
  session: Pick<MountSession, "lastRefresh">,
  now: Date
): FailedRefresh | null {
  const last = session.lastRefresh;
  if (last === undefined || last.outcome !== "failed") return null;
  const stampedAt = new Date(last.at).getTime();
  if (Number.isNaN(stampedAt)) return last;
  const ageMs = now.getTime() - stampedAt;
  return ageMs >= 0 && ageMs < REFRESH_COOLDOWN_MS ? last : null;
}
