/**
 * `nexus admin vibe-deployment mark-failed` — the terminal failure.
 *
 * Reachable from three states, which also makes it the WRONG verb for a
 * deployment that served traffic: `mark-rolled-back` is that one.
 *
 * 🚨 `--error-reason` IS CUSTOMER-VISIBLE and is stored verbatim.
 */

import type { Command } from "commander";

import { type AdminVibeDeploymentResponse } from "../../admin-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printDeploymentRecord } from "./_shared/print-deployment-record";

const HELP = `
Examples:
  $ nexus admin vibe-deployment mark-failed 11111111-1111-4111-8111-… \\
      --org org_abc --error-reason "health checks never passed after ALB swap"

Notes:
  TERMINAL, and reachable from three states — BUILDING, AWAITING_APPROVAL and
  DEPLOYING. It is the one verb that ends a deployment from anywhere before
  HEALTHY, which also makes it the wrong verb for a deployment that DID serve
  traffic: use "mark-rolled-back" for that.
  🚨 --error-reason IS CUSTOMER-VISIBLE. Stored verbatim, 1-2000 characters, and
  required — keep internal hostnames and stack traces out of it.
  It records no image ref, so whatever imageRef the row already carries is what
  the failure is attributed to.
`;

/** Registers the verb on the `vibe-deployment` command group. */
export function registerVibeDeploymentMarkFailedCommand(
  dep: Command,
  admin: Command,
  program: Command
): void {
  dep
    .command("mark-failed")
    .description("Terminal failure from BUILDING | AWAITING_APPROVAL | DEPLOYING.")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--error-reason <text>", "Customer-visible failure rationale (1-2000 chars)")
    .addHelpText("after", HELP)
    .action(async (id: string, cmdOpts: { org: string; errorReason: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/mark-failed`,
          body: { organizationId: cmdOpts.org, errorReason: cmdOpts.errorReason }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
