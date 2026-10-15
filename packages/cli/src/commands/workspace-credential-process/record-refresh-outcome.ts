import { printWarning } from "../../output";
import type { MountSession } from "../../workspace-direct-mount/mount-session";
import { REFRESH_FAILURE_TABLE } from "../../workspace-direct-mount/refresh-failure-table";
import type { RefreshRecord } from "../../workspace-direct-mount/refresh-record";
import { announced, shouldNotify } from "../../workspace-direct-mount/should-notify";
import { writeSession } from "../../workspace-direct-mount/write-session";
import { notifyDesktop } from "../workspace-mount/notify-desktop";
import { describeError } from "./describe-error";
import { refreshContextOf } from "./refresh-context-of";

/**
 * Write the outcome BEFORE anything is printed or the process exits, so
 * `workspace status` can name what happened even when the helper is killed a
 * moment later.
 *
 * A write the disk refuses (full, or the directory no longer the caller's) is
 * reported on stderr and stops nothing: the caller still owes the SDK its
 * document or its exit code, and a lease that was minted is served rather
 * than thrown away for a bookkeeping failure. The notification waits on the
 * record, so a directory that refuses every write cannot turn every S3 request
 * into a desktop notification.
 */
export function recordRefreshOutcome(
  session: MountSession,
  record: RefreshRecord,
  now: Date
): void {
  const notify = shouldNotify(session, record, now);
  const next: MountSession = {
    ...session,
    lastRefresh: record,
    ...(notify ? { lastNotified: announced(session, record) } : {})
  };
  try {
    writeSession(next);
  } catch (error) {
    printWarning(
      `Could not record this renewal for "nexus workspace status": ${describeError(error)}`,
      REFRESH_FAILURE_TABLE["local-failed"].statusHint(refreshContextOf(session))
    );
    return;
  }
  if (notify) notifyDesktop(next.volumeName, record, refreshContextOf(session));
}
