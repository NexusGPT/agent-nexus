import { color, isJsonMode, printTable } from "../../../output";
import { type ListPendingApprovalsResponse } from "../../../vibe-wire-types";
import { colorApprovalStatus } from "./color-approval-status";
import { formatTimestamp } from "./format-timestamp";

// Full id (not shortenId): `approvals get/decide` take the deployment id
// and this queue is the only way to discover which deployments are gated.
export function printApprovalRequestList(data: ListPendingApprovalsResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.requests.length === 0) {
    console.log(color.dim("No pending approvals."));
    return;
  }

  const rows = data.requests.map((r) => ({
    deploymentId: r.vibeDeploymentId,
    status: colorApprovalStatus(r.status),
    requiredApprovals: r.requiredApprovals,
    expiresAt: formatTimestamp(r.expiresAt),
    createdAt: formatTimestamp(r.createdAt)
  }));

  printTable(rows, [
    { key: "deploymentId", label: "Deployment" },
    { key: "status", label: "Status" },
    { key: "requiredApprovals", label: "Required" },
    { key: "expiresAt", label: "Expires" },
    { key: "createdAt", label: "Created" }
  ]);
}
