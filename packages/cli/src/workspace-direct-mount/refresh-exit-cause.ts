import type { FailureCause } from "../errors";
import type { RefreshFailureReason } from "./refresh-record";

/**
 * The exit category a refused refresh reports. The two helper-side refusals
 * have no {@link FailureCause} of their own: nothing about the caller's input
 * is wrong and no retry helps until the drive is mounted again, which is
 * `local-failed`'s own definition.
 */
export const REFRESH_EXIT_CAUSE = {
  "not-authenticated": "not-authenticated",
  "connection-failed": "connection-failed",
  "timed-out": "timed-out",
  "not-found": "not-found",
  "workspace-replaced": "local-failed",
  "access-downgraded": "local-failed",
  "remote-error": "remote-error",
  "local-failed": "local-failed"
} as const satisfies Record<RefreshFailureReason, FailureCause>;
