import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type SingleVibeGitProjectResponse } from "../../../vibe-wire-types";
import { printVibeGitProject } from "../_shared/print-vibe-git-project";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps reprovision-repo` */
export function registerAppsReprovisionRepoCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("reprovision-repo <appId>")
    .description("Retry provisioning a FAILED git project")
    .addHelpText(
      "after",
      `
Notes:
A git project whose in-cluster materialization FAILED is otherwise a dead
end — the provision path 409s on the already-attached guard. This re-arms
the FAILED project back to PENDING so the agent re-materializes it on its
next pull; nothing else changes (same project id, same git URL).

Only a FAILED project can be retried — READY / PENDING / ARCHIVED return
409, and an app with no git project returns 404.

Examples:
  $ nexus apps reprovision-repo 11111111-2222-4333-8444-555555555555
`
    )
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<SingleVibeGitProjectResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/repository/reprovision`
        });
        printVibeGitProject(data.gitProject ?? data.repository, { freshlyProvisioned: true });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
