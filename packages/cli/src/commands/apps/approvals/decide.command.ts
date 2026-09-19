import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type RecordApprovalDecisionResponse } from "../../../vibe-wire-types";
import { printDecisionResult } from "../_shared/print-decision-result";
import { resolveDecision } from "../_shared/resolve-decision";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps approvals decide` */
export function registerAppsApprovalsDecideCommand(approvals: Command, program: Command): Command {
  const leaf = approvals
    .command("decide <appId> <deploymentId>")
    .description("Record an APPROVE or REJECT decision on a gated deployment")
    .option("--approve", "Approve the deployment.")
    .option("--reject", "Reject the deployment.")
    .option("--note <text>", "Optional reviewer note (≤ 2 KB).")
    .addHelpText(
      "after",
      `
Notes:
Pass exactly one of --approve / --reject. You cannot decide your own
deployment (403); a duplicate or already-decided/expired request is 409.

Examples:
  $ nexus apps approvals decide 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa --approve
  $ nexus apps approvals decide 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa --reject --note "needs a migration first"
`
    )
    .action(
      async (
        appId: string,
        deploymentId: string,
        cmdOpts: { approve?: boolean; reject?: boolean; note?: string }
      ) => {
        try {
          const decision = resolveDecision(cmdOpts);
          const note = cmdOpts.note?.trim();
          const opts = resolveTenantOpts(program);
          const data = await tenantRequest<RecordApprovalDecisionResponse>(opts, {
            method: "POST",
            path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}/approval/decisions`,
            body: note ? { decision, note } : { decision }
          });
          printDecisionResult(data);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  return leaf;
}
