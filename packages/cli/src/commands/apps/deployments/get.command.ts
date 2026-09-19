import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type GetDeploymentResponse } from "../../../vibe-wire-types";
import { printDeploymentDetail } from "../_shared/print-deployment-detail";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps deployments get` */
export function registerAppsDeploymentsGetCommand(deployments: Command, program: Command): Command {
  const leaf = deployments
    .command("get <appId> <deploymentId>")
    .description("Show one deployment with its build job")
    .addHelpText(
      "after",
      `
Notes:
TWO RECORDS, NOT ONE. The deployment prints first and its build job second, and
the build job is where Logs, Builder and Duration live. A deployment that never
reached a build prints "No build job." instead of a second record.

THIS IS THE BUILD LOG, and "apps logs" is the APPLICATION log. If you are
looking for what the container printed after it started, that is the other
command.

Detected port answers the question that usually brings you here. It reads "not
detected — using <default>" rather than a dash, because a dash would say
"nothing to show" when the real fact is that the build observed no port and a
default therefore applies.

A deployment built with --force-rebuild says so, which is what explains the -v
suffix on its image tag.

Examples:
  $ nexus apps deployments get 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa
  $ nexus apps deployments get 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa --json
`
    )
    .action(async (appId: string, deploymentId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetDeploymentResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}`
        });
        printDeploymentDetail(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
