import { reportFailure } from "../../errors";
import type { MountSession } from "../../workspace-direct-mount/mount-session";
import { REFRESH_EXIT_CAUSE } from "../../workspace-direct-mount/refresh-exit-cause";
import { REFRESH_FAILURE_TABLE } from "../../workspace-direct-mount/refresh-failure-table";
import type { RefreshFailureReason } from "../../workspace-direct-mount/refresh-record";
import { recordRefreshOutcome } from "./record-refresh-outcome";
import { refreshContextOf } from "./refresh-context-of";

/** Print the refusal on stderr and return its exit code. Stdout stays empty. */
export function reportRefreshFailure(
  session: MountSession,
  reason: RefreshFailureReason,
  detail: string
): number {
  const hint = REFRESH_FAILURE_TABLE[reason].statusHint(refreshContextOf(session));
  return reportFailure(
    REFRESH_EXIT_CAUSE[reason],
    `Could not renew access to "${session.workspace.slug}": ${detail}`,
    hint
  );
}

/**
 * Record a failed refresh, notify on the ok→failed transition, and refuse.
 * `now` is taken fresh: the attempts before this may have waited seconds.
 */
export function failRefresh(
  session: MountSession,
  reason: RefreshFailureReason,
  detail: string
): number {
  const now = new Date();
  recordRefreshOutcome(session, { at: now.toISOString(), outcome: "failed", reason }, now);
  return reportRefreshFailure(session, reason, detail);
}
