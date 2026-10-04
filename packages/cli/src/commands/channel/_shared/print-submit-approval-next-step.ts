import { color } from "../../../output";
import { isApprovalRejected } from "../template-approval.exit-category";
import type { SubmitApprovalOutcome } from "../template-submit-approval.await-verdict";

/**
 * The closing `Next:` line of `nexus channel whatsapp-template submit-approval`,
 * lifted out of the action verbatim. Human mode only — the JSON arm returns
 * before reaching it.
 */
export function printSubmitApprovalNextStep(verdict: SubmitApprovalOutcome | undefined): void {
  // A REJECTED TEMPLATE'S NEXT STEP IS NOT "ATTACH IT". This line printed
  // unconditionally, so the command rendered Meta's refusal and then
  // offered the one action the refusal rules out — attaching a template
  // that can never be sent. Its body and --category are fixed at creation
  // (both Notes above say so), so the remedy is a corrected replacement,
  // not another call against this template.
  if (isApprovalRejected(verdict?.status)) {
    console.log(
      `\nNext: REJECTED — this template cannot be attached or sent, and its body and` +
        ` --category cannot be changed. File a corrected replacement:\n  ${color.dim(
          "nexus channel whatsapp-template create ... --submit --category <category>"
        )}`
    );
  } else {
    console.log(
      `\nNext: Attach to deployment: ${color.dim("nexus deployment template attach <depId> --template-id ...")}`
    );
  }
}
