import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type StandaloneVibeGitProjectResponse } from "../../../vibe-wire-types";
import { printVibeGitProject } from "../_shared/print-vibe-git-project";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps git-project get` */
export function registerAppsGitProjectGetCommand(project: Command, program: Command): Command {
  const leaf = project
    .command("get <projectId>")
    .description("Get a git project by id")
    .addHelpText(
      "after",
      `
Notes:
Shows the project's lifecycle status and its build source. A PENDING project
has not been materialized on the git host yet; READY is serving. FAILED means
materialization failed — retry it with "git-project reprovision".

Build source is what the build executor clones — it is not your push remote.
Run "nexus apps git-credentials" for the URL and token you push with.

Examples:
  $ nexus apps git-project get 11111111-2222-4333-8444-555555555555
`
    )
    .action(async (projectId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<StandaloneVibeGitProjectResponse>(opts, {
          method: "GET",
          path: `/api/vibe/git-projects/${encodeURIComponent(projectId)}`
        });
        printVibeGitProject(data.gitProject);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
