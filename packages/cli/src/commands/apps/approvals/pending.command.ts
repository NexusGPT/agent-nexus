import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type ListPendingApprovalsResponse } from "../../../vibe-approval-wire-types";
import { printApprovalRequestList } from "../_shared/print-approval-request-list";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps approvals pending` */
export function registerAppsApprovalsPendingCommand(approvals: Command, program: Command): Command {
  const leaf = approvals
    .command("pending")
    .description("List PENDING approval requests across the org, oldest-first")
    .addHelpText(
      "after",
      `
Notes:
The reviewer queue — every deployment waiting on an approval gate, across
all apps in your org. Decide one with \`nexus apps approvals decide\`.

Examples:
  $ nexus apps approvals pending
  $ nexus apps approvals pending --json | jq '.requests[].vibeDeploymentId'
`
    )
    .action(async () => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListPendingApprovalsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/approvals/pending"
        });
        printApprovalRequestList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
