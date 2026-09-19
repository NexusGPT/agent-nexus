import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type ListDeploymentsResponse } from "../../../vibe-wire-types";
import { printDeploymentList } from "../_shared/print-deployment-list";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps deployments list` */
export function registerAppsDeploymentsListCommand(
  deployments: Command,
  program: Command
): Command {
  const leaf = deployments
    .command("list <appId>")
    .description("List an app's deployments, newest-first")
    .addHelpText(
      "after",
      `
Notes:
The Id column is never truncated, because "apps deployments get <appId>
<deploymentId>" takes it — this listing is where that second id comes from.

Commit is shortened to seven characters for the table. The full trigger sha is
in --json.

Version counts up per app, so v1 is that app's first deployment and the newest
row carries the highest number.

An app with no deployments prints one dim line rather than an empty table.

Examples:
  $ nexus apps deployments list 11111111-2222-4333-8444-555555555555
  $ nexus apps deployments list 11111111-2222-4333-8444-555555555555 --json
`
    )
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListDeploymentsResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments`
        });
        printDeploymentList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
