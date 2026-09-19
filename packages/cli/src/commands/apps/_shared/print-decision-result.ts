import { color, isJsonMode } from "../../../output";
import { type RecordApprovalDecisionResponse } from "../../../vibe-wire-types";
import { colorApprovalStatus } from "./color-approval-status";
import { printApprovalRequest } from "./print-approval-request";

export function printDecisionResult(data: RecordApprovalDecisionResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const verb = data.decision.decision === "APPROVE" ? "Approved" : "Rejected";
  console.log(
    `${color.green("✓")} ${verb} — request is now ${colorApprovalStatus(data.request.status)}`
  );
  printApprovalRequest(data.request);
}
