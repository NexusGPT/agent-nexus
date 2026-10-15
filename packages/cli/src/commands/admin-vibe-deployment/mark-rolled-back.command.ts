/**
 * `nexus admin vibe-deployment mark-rolled-back` — the deployer's own path.
 *
 * HEALTHY is the state that separates this from `mark-failed`: a deployment that
 * reached HEALTHY served traffic, so its ending is a rollback. The cost-safety
 * AUTO-rollback is a different mechanism with its own sweep; recording one by
 * hand here neither runs it nor stops it.
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
  $ nexus admin vibe-deployment mark-rolled-back 11111111-1111-4111-8111-… \\
      --org org_abc --error-reason "5xx rate spiked after the flip"

Notes:
  DEPLOYING | HEALTHY → ROLLED_BACK, and HEALTHY is the state that separates this
  from "mark-failed": a deployment that reached HEALTHY served traffic, so its
  ending is a rollback, not a failure.
  THIS IS THE DEPLOYER'S PATH, NOT THE COST-SAFETY ONE. The automatic rollback
  driven by cost safety is a different mechanism with its own sweep
  ("nexus admin vibe-rollback-sweep trigger"); recording one by hand here does
  not run it, and it does not stop it either.
  🚨 --error-reason IS CUSTOMER-VISIBLE. Stored verbatim, 1-2000 characters, and
  required.
`;

/** Registers the verb on the `vibe-deployment` command group. */
export function registerVibeDeploymentMarkRolledBackCommand(
  dep: Command,
  admin: Command,
  program: Command
): void {
  dep
    .command("mark-rolled-back")
    .description(
      "DEPLOYING | HEALTHY → ROLLED_BACK. Deployer's own post-flip health-check failure path (distinct from cost-safety auto-rollback)."
    )
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--error-reason <text>", "Customer-visible rollback rationale (1-2000 chars)")
    .addHelpText("after", HELP)
    .action(async (id: string, cmdOpts: { org: string; errorReason: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/mark-rolled-back`,
          body: { organizationId: cmdOpts.org, errorReason: cmdOpts.errorReason }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
