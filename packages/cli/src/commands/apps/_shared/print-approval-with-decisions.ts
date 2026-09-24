import { color, isJsonMode, printTable } from "../../../output";
import {
  type GetApprovalResponse,
  type VibeApprovalDecisionDto
} from "../../../vibe-approval-wire-types";
import { formatTimestamp } from "./format-timestamp";
import { printApprovalRequest } from "./print-approval-request";
import { truncate } from "./truncate";

export function printDecisionTable(decisions: VibeApprovalDecisionDto[]): void {
  if (decisions.length === 0) {
    console.log(color.dim("\nNo decisions yet."));
    return;
  }
  console.log(color.bold("\nDecisions"));
  const rows = decisions.map((d) => ({
    decision: d.decision === "APPROVE" ? color.green(d.decision) : color.red(d.decision),
    decidedBy: d.decidedByUserId ?? color.dim("(deleted user)"),
    note: d.note === null ? color.dim("—") : truncate(d.note.replace(/\s+/g, " "), 48),
    decidedAt: formatTimestamp(d.decidedAt)
  }));
  printTable(rows, [
    { key: "decision", label: "Decision" },
    { key: "decidedBy", label: "Decided by" },
    { key: "note", label: "Note" },
    { key: "decidedAt", label: "Decided" }
  ]);
}

export function printApprovalWithDecisions(data: GetApprovalResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  printApprovalRequest(data.request);
  printDecisionTable(data.decisions);
}
