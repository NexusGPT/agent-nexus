import type { MountSession, NotifiedAt } from "./mount-session";
import type { RefreshRecord } from "./refresh-record";

/** Repeat a transition notification no sooner than this. */
export const NOTIFICATION_DEBOUNCE_MS = 10 * 60 * 1000;

/**
 * Should this refresh's outcome reach the desktop?
 *
 * Only a TRANSITION notifies — ok→failed and failed→ok — and never the same
 * outcome twice inside {@link NOTIFICATION_DEBOUNCE_MS}: a drive flapping
 * between the two on every click announces each state once per window. A
 * mount with no refresh yet counts as ok, so the first failure notifies and
 * the first success stays quiet. An announcement stamped in the future (the
 * clock was stepped back since) does not suppress, or the window would last
 * until the clock caught up with the stamp.
 */
export function shouldNotify(
  session: Pick<MountSession, "lastRefresh" | "lastNotified">,
  next: RefreshRecord,
  now: Date
): boolean {
  const previous = session.lastRefresh?.outcome ?? "ok";
  if (previous === next.outcome) return false;
  const announcedAt = session.lastNotified?.[next.outcome];
  if (announcedAt === undefined) return true;
  const ageMs = now.getTime() - new Date(announcedAt).getTime();
  return ageMs < 0 || ageMs >= NOTIFICATION_DEBOUNCE_MS;
}

/** The session's announcement record after `record` was announced at `record.at`. */
export function announced(
  session: Pick<MountSession, "lastNotified">,
  record: RefreshRecord
): NotifiedAt {
  return { ...session.lastNotified, [record.outcome]: record.at };
}
