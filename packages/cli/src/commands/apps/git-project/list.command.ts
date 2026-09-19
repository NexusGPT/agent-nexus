import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type ListVibeGitProjectsResponse } from "../../../vibe-wire-types";
import { printVibeGitProjectList } from "../_shared/print-vibe-git-project-list";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps git-project list` */
export function registerAppsGitProjectListCommand(project: Command, program: Command): Command {
  const leaf = project
    .command("list")
    .description("List your organization's git projects, newest first")
    .addHelpText(
      "after",
      `
Notes:
Lists every project in your org — standalone code stores and the ones apps
are attached to alike, in every lifecycle status.

Examples:
  $ nexus apps git-project list
  $ nexus apps --json git-project list
`
    )
    .action(async () => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListVibeGitProjectsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/git-projects"
        });
        printVibeGitProjectList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
