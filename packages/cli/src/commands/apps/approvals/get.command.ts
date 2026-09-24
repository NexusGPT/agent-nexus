import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type GetApprovalResponse } from "../../../vibe-approval-wire-types";
import { printApprovalWithDecisions } from "../_shared/print-approval-with-decisions";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps approvals get` */
export function registerAppsApprovalsGetCommand(approvals: Command, program: Command): Command {
  const leaf = approvals
    .command("get <appId> <deploymentId>")
    .description("Show a deployment's approval request with its decisions")
    .addHelpText(
      "after",
      `
Notes:
Returns 404 when the deployment is ungated (no approval gate) or not in
your org.

Examples:
  $ nexus apps approvals get 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa
`
    )
    .action(async (appId: string, deploymentId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetApprovalResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}/approval`
        });
        printApprovalWithDecisions(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
