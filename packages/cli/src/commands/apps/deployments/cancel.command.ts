import type { Command } from "commander";

import { handleError } from "../../../errors";
import { EXIT_CODES } from "../../../exit-codes";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { tenantRequest } from "../../../util/tenant-http";
import { type CancelDeploymentBuildResponse } from "../../../vibe-wire-types";
import { printCancelledBuild } from "../_shared/print-cancelled-build";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps deployments cancel` */
export function registerAppsDeploymentsCancelCommand(
  deployments: Command,
  program: Command
): Command {
  const leaf = confirmable(deployments.command("cancel <appId> <deploymentId>"))
    .description("Stop a deployment's build while it is queued or running")
    .addHelpText(
      "after",
      `
Notes:
Stops the BUILD, never a running app. A deployment whose build is queued or
still running ends CANCELLED and never goes live; whatever version is serving
now keeps serving. A deployment already rolling out, live, or ended has no build
left to stop.

The build machine is released by the tenant agent on its next pass, not by this
command. It returns as soon as the cancellation is recorded.

A build that finished before the request landed is not an error: the command
prints what became of it instead and exits 0, so running it twice is safe.

Examples:
  $ nexus apps deployments cancel 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa
  $ nexus apps deployments cancel 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa --yes --json
`
    )
    .action(async (appId: string, deploymentId: string, cmdOpts: { yes?: boolean }) => {
      try {
        const ok = await confirmDestructive(
          "Cancel this build? It stops building and never goes live.",
          { ...cmdOpts, rerun: `nexus apps deployments cancel ${appId} ${deploymentId} --yes` }
        );
        if (!ok) {
          // ??= keeps the category confirmDestructive already set when it
          // refused for want of a terminal; a typed "n" set nothing.
          process.exitCode ??= EXIT_CODES.failed;
          return;
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<CancelDeploymentBuildResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}/cancel`
        });
        printCancelledBuild(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
