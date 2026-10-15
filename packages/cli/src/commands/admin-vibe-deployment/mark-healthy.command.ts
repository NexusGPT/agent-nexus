/**
 * `nexus admin vibe-deployment mark-healthy` — DEPLOYING → HEALTHY.
 *
 * It RECORDS an outcome and neither performs nor re-checks one, so it is run
 * after observing the ALB swap and the health checks, never to trigger them.
 */

import type { Command } from "commander";

import { type AdminVibeDeploymentResponse } from "../../admin-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printDeploymentRecord } from "./_shared/print-deployment-record";

const HELP = `
Examples:
  $ nexus admin vibe-deployment mark-healthy 11111111-1111-4111-8111-… \\
      --org org_abc

Notes:
  DEPLOYING → HEALTHY. This RECORDS an outcome; it does not perform or re-check
  one. The ALB swap and the health checks are what the state claims already
  happened, so run it after observing them, never to trigger them.
  It is the verb that ends a deployment successfully, and the row's Color and
  Version columns are what identify which slot is now live.
  Takes no reason and no image ref — a healthy deployment records nothing beyond
  the transition.
`;

/** Registers the verb on the `vibe-deployment` command group. */
export function registerVibeDeploymentMarkHealthyCommand(
  dep: Command,
  admin: Command,
  program: Command
): void {
  dep
    .command("mark-healthy")
    .description("DEPLOYING → HEALTHY. ALB swap completed + health checks passed.")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .addHelpText("after", HELP)
    .action(async (id: string, cmdOpts: { org: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/mark-healthy`,
          body: { organizationId: cmdOpts.org }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
