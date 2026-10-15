/**
 * `nexus admin vibe-deployment begin-deploy` — the manual override.
 *
 * It accepts BOTH BUILDING and AWAITING_APPROVAL as source states, which is what
 * makes it an override: driving it from AWAITING_APPROVAL puts the deployment
 * past the approval gate without a reviewer acting.
 */

import type { Command } from "commander";

import { type AdminVibeDeploymentResponse } from "../../admin-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printDeploymentRecord } from "./_shared/print-deployment-record";

const HELP = `
Examples:
  $ nexus admin vibe-deployment begin-deploy 11111111-1111-4111-8111-… \\
      --org org_abc --image-ref ecr/vibe/app:sha-abc123

Notes:
  BUILDING | AWAITING_APPROVAL → DEPLOYING. It accepts BOTH source states, which
  is what makes it the manual override: driving it from AWAITING_APPROVAL puts
  the deployment past the approval gate without a reviewer acting.
  --image-ref is required and is recorded on the row, so this verb decides which
  artifact ships. It is not read back from the build — supply the ref the build
  runner actually produced.
  The rollout itself is not performed here. This records the state the deployer
  acts on; "mark-healthy" is what records that it landed.
`;

/** Registers the verb on the `vibe-deployment` command group. */
export function registerVibeDeploymentBeginDeployCommand(
  dep: Command,
  admin: Command,
  program: Command
): void {
  dep
    .command("begin-deploy")
    .description("BUILDING | AWAITING_APPROVAL → DEPLOYING. Records imageRef on the row.")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--image-ref <ref>", "ECR image ref the build runner produced")
    .addHelpText("after", HELP)
    .action(async (id: string, cmdOpts: { org: string; imageRef: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/begin-deploy`,
          body: { organizationId: cmdOpts.org, imageRef: cmdOpts.imageRef }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
