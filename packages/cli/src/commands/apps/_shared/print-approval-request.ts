import { printRecord } from "../../../output";
import { type VibeApprovalRequestDto } from "../../../vibe-approval-wire-types";
import { colorApprovalStatus } from "./color-approval-status";
import { formatTimestamp } from "./format-timestamp";

export function printApprovalRequest(request: VibeApprovalRequestDto): void {
  printRecord(request, [
    { key: "id", label: "Request id" },
    { key: "vibeDeploymentId", label: "Deployment" },
    { key: "status", label: "Status", format: (v) => colorApprovalStatus(String(v)) },
    { key: "requiredApprovals", label: "Required" },
    { key: "expiresAt", label: "Expires", format: (v) => formatTimestamp(String(v)) },
    {
      key: "decidedAt",
      label: "Decided",
      format: (v) => (v === null ? "—" : formatTimestamp(String(v)))
    },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) }
  ]);
}
