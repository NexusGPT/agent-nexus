import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError
} from "@agent-nexus/sdk";

import type { RefreshFailureReason } from "./refresh-record";

/**
 * Which reason a re-mint failure is, from the error the client raised.
 *
 * 401 and 403 both land on `not-authenticated`: a revoked key, a trimmed scope
 * and a lost membership all mean "this key may no longer mint for this
 * tenant", and the fix is the same sign-in under the pinned profile name.
 */
export function refreshFailureReasonFor(error: unknown): RefreshFailureReason {
  if (error instanceof NexusTimeoutError) return "timed-out";
  if (error instanceof NexusConnectionError) return "connection-failed";
  if (error instanceof NexusAuthenticationError) return "not-authenticated";
  if (error instanceof NexusApiError) {
    if (error.status === 403) return "not-authenticated";
    if (error.status === 404) return "not-found";
    return "remote-error";
  }
  return "remote-error";
}
