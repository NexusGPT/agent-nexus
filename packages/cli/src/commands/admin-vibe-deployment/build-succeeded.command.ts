/**
 * `nexus admin vibe-deployment build-succeeded` — BUILDING onward.
 *
 * The NEXT stage is the use case's decision and not the operator's: it reads the
 * approval-request row and branches to AWAITING_APPROVAL or straight to
 * DEPLOYING. This verb only reports which it picked.
 */

import type { Command } from "commander";

import { type AdminVibeDeploymentResponse } from "../../admin-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printDeploymentRecord } from "./_shared/print-deployment-record";

const HELP = `
Examples:
  $ nexus admin vibe-deployment build-succeeded 11111111-1111-… \\
      --org org_abc --image-ref ecr/vibe/app:sha-abc123

Notes:
  Next-stage decision is the use case's, not the operator's. The use
  case queries the approval-request row for this deployment:
    - row exists → BUILDING → AWAITING_APPROVAL (waits for reviewer)
    - no row      → BUILDING → DEPLOYING (no approval gate)
  imageRef is stamped on the row in EITHER branch, so the approval
  reviewer sees the actual built image in the dashboard.
`;

/** Registers the verb on the `vibe-deployment` command group. */
export function registerVibeDeploymentBuildSucceededCommand(
  dep: Command,
  admin: Command,
  program: Command
): void {
  dep
    .command("build-succeeded")
    .description(
      "BUILDING → AWAITING_APPROVAL (if approval-request row exists) | DEPLOYING (otherwise). Stamps imageRef on the row in either branch."
    )
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--image-ref <ref>", "ECR image ref the build runner produced")
    .addHelpText("after", HELP)
    .action(async (id: string, cmdOpts: { org: string; imageRef: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/build-succeeded`,
          body: { organizationId: cmdOpts.org, imageRef: cmdOpts.imageRef }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
