import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type StandaloneVibeGitProjectResponse } from "../../../vibe-wire-types";
import { printVibeGitProject } from "../_shared/print-vibe-git-project";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps git-project reprovision` */
export function registerAppsGitProjectReprovisionCommand(
  project: Command,
  program: Command
): Command {
  const leaf = project
    .command("reprovision <projectId>")
    .description("Retry provisioning a FAILED git project")
    .addHelpText(
      "after",
      `
Notes:
A project whose materialization FAILED is otherwise a dead end — its name is
taken, so you cannot simply create it again. This re-arms it back to PENDING
and your tenant re-materializes it on its next pass; nothing else changes
(same project id, same URL).

Only a FAILED project can be retried — READY / PENDING / ARCHIVED return 409.

Examples:
  $ nexus apps git-project reprovision 11111111-2222-4333-8444-555555555555
`
    )
    .action(async (projectId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<StandaloneVibeGitProjectResponse>(opts, {
          method: "POST",
          path: `/api/vibe/git-projects/${encodeURIComponent(projectId)}/reprovision`
        });
        printVibeGitProject(data.gitProject, { freshlyProvisioned: true });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
