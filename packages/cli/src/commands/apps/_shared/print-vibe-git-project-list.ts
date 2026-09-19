import { color, isJsonMode, printTable } from "../../../output";
import { type ListVibeGitProjectsResponse } from "../../../vibe-wire-types";
import { formatTimestamp } from "./format-timestamp";

export function printVibeGitProjectList(data: ListVibeGitProjectsResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.gitProjects.length === 0) {
    console.log(color.dim("No Vibe git projects yet."));
    return;
  }

  // gitRemoteUrl is deliberately absent: it is the build executor's in-VPC
  // address, unreachable from a user's machine, and at 40 columns it crowded
  // out the fields a list is actually scanned for. `status` already carries
  // whether the repo materialized. The push URL comes from git-credentials.
  // Full id: `git-project get <projectId>` and `git-project reprovision
  // <projectId>` take it.
  const rows = data.gitProjects.map((p) => ({
    id: p.id,
    name: p.name,
    defaultBranch: p.defaultBranch,
    status: p.status,
    createdAt: formatTimestamp(p.createdAt)
  }));

  printTable(rows, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name", width: 24 },
    { key: "defaultBranch", label: "Default branch", width: 16 },
    { key: "status", label: "Status", width: 10 },
    { key: "createdAt", label: "Created", width: 21 }
  ]);
  console.log("");
  console.log(color.dim("To push to a project, run: nexus apps git-credentials"));
}
