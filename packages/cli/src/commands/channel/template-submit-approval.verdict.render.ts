import { color } from "../../output";
import { isApprovalNoLongerPending } from "./template-approval.read-verdict";
import type { SubmitApprovalOutcome } from "./template-submit-approval.await-verdict";

/**
 * Narrate what `submit-approval --wait`'s poll saw, on the human channel only.
 *
 * ⚠️ THE THIRD BRANCH IS SILENCE, AND IT IS FAITHFUL RATHER THAN AN OVERSIGHT.
 * When no probe ever found the row but the status the submit returned is already
 * settled, the original printed neither the resolution line (it lived inside the
 * loop) nor the timeout line (its condition was false). That gap is preserved
 * here so the split changes no output; closing it is a behaviour change and
 * belongs with whoever reconciles the two polls.
 */
export function renderSubmitApprovalVerdict(outcome: SubmitApprovalOutcome): void {
  if (outcome.observedTerminal) {
    console.log(`Approval resolved: ${color.cyan(outcome.status)}`);
    if (outcome.rejectionReason) console.log(`Reason: ${outcome.rejectionReason}`);
    return;
  }

  if (!isApprovalNoLongerPending(outcome.status)) {
    // A timeout, not a verdict — the command's Notes say so, and the document
    // says so too rather than leaving a caller to infer it from a status that
    // never moved.
    console.log(
      `Still ${outcome.status} after 2m. Check again: ${color.dim("nexus channel whatsapp-template approvals")}`
    );
  }
}
