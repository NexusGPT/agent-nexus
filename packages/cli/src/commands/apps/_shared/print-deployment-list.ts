import { color, isJsonMode, printTable } from "../../../output";
import { type ListDeploymentsResponse } from "../../../vibe-wire-types";
import { colorizeStatus } from "./colorize-status";
import { formatReplacedBy } from "./format-replaced-by";
import { formatTimestamp } from "./format-timestamp";

export function printDeploymentList(data: ListDeploymentsResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.deployments.length === 0) {
    console.log(color.dim("No deployments yet."));
    return;
  }

  // Full id: `deployments get <appId> <deploymentId>` takes it.
  const rows = data.deployments.map((d) => ({
    id: d.id,
    version: `v${d.versionNumber}`,
    // A DISPLACED row names what replaced it in the same cell, so a burst of
    // pushes reads as a chain (v5 → v6 → v7) rather than a column of
    // unexplained non-successes.
    status:
      d.status === "DISPLACED"
        ? `${colorizeStatus(d.status)} ${color.dim(`→ ${formatReplacedBy(d.displacedBy)}`)}`
        : colorizeStatus(d.status),
    commit: d.triggerSha.slice(0, 7),
    createdAt: formatTimestamp(d.createdAt)
  }));

  printTable(rows, [
    { key: "id", label: "Id" },
    { key: "version", label: "Version" },
    { key: "status", label: "Status" },
    { key: "commit", label: "Commit" },
    { key: "createdAt", label: "Created" }
  ]);
}
