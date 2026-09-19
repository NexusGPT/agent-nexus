import { color, isJsonMode, printTable } from "../../../output";
import { type ListVibeAppsResponse } from "../../../vibe-wire-types";
import { formatDeployabilityCell } from "./format-deployability";
import { formatTimestamp } from "./format-timestamp";

export function printVibeAppList(data: ListVibeAppsResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.apps.length === 0) {
    console.log(color.dim("No Vibe apps yet."));
    return;
  }

  // Full id: this list is where users get the app id, and every other
  // `apps` command takes it as an argument.
  const rows = data.apps.map((a) => ({
    id: a.id,
    name: a.name,
    deployBranch: a.deployBranch,
    // Compact on purpose — a table cell, where `app get` has room for the fix.
    // It earns its column by separating the two apps that render identically in
    // every other one: the app nobody has pushed to, and the app that has no
    // source to push to.
    source: formatDeployabilityCell(a.deployability),
    approvals: a.requireApprovals ? color.yellow("required") : color.dim("off"),
    publicUrl: a.publicUrl ?? color.dim("—"),
    createdAt: formatTimestamp(a.createdAt)
  }));

  printTable(rows, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "deployBranch", label: "Deploy" },
    { key: "source", label: "Source" },
    { key: "approvals", label: "Approvals" },
    { key: "publicUrl", label: "URL" },
    { key: "createdAt", label: "Created" }
  ]);
}
