import { color, isJsonMode, printTable } from "../../../output";
import { type ListDeploymentsResponse } from "../../../vibe-wire-types";
import { colorizeStatus } from "./colorize-status";
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
    status: colorizeStatus(d.status),
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
