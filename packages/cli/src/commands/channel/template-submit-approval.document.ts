import { isApprovalNoLongerPending } from "./template-approval.read-verdict";
import type { SubmitApprovalOutcome } from "./template-submit-approval.await-verdict";

/**
 * The fields `submit-approval` adds to its `--json` record on top of the submit
 * response, assembled in one place.
 *
 * `timedOut` is the field that makes the record honest: `--wait` exiting 0 with
 * a pending status is a TIMEOUT and not a verdict, and a consumer reading only
 * `status` cannot tell those apart. It is false whenever `--wait` was not given,
 * because a command that never waited cannot have timed out.
 */
export function submitApprovalDocumentFields(
  outcome: SubmitApprovalOutcome | undefined,
  waited: boolean
): Record<string, unknown> {
  if (outcome === undefined) return { waited, timedOut: false };

  return {
    status: outcome.status,
    ...(outcome.rejectionReason === undefined ? {} : { rejectionReason: outcome.rejectionReason }),
    waited,
    timedOut: waited && !isApprovalNoLongerPending(outcome.status)
  };
}
