/**
 * `nexus admin vibe-deployment await-approval` — BUILDING → AWAITING_APPROVAL,
 * forced.
 *
 * `build-succeeded` is preferred to this one and the help below says why: this
 * verb parks the deployment with no image, so a reviewer opening it has nothing
 * to approve.
 */

import type { Command } from "commander";

import { type AdminVibeDeploymentResponse } from "../../admin-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printDeploymentRecord } from "./_shared/print-deployment-record";

const HELP = `
Examples:
  $ nexus admin vibe-deployment await-approval 11111111-1111-4111-8111-… \\
      --org org_abc

Notes:
  BUILDING → AWAITING_APPROVAL, forced.
  PREFER "build-succeeded" TO THIS. That verb reads the approval-request row and
  picks AWAITING_APPROVAL or DEPLOYING for itself, and it stamps imageRef on the
  way through. This one parks the deployment without an image, so a reviewer
  opening it sees no image to approve.
  Reach for it when the build's outcome has to be recorded separately from the
  image it produced — QA, or a row that needs holding while something else is
  worked out.
  Takes no image ref, so nothing about the artifact is recorded here.
`;

/** Registers the verb on the `vibe-deployment` command group. */
export function registerVibeDeploymentAwaitApprovalCommand(
  dep: Command,
  admin: Command,
  program: Command
): void {
  dep
    .command("await-approval")
    .description("BUILDING → AWAITING_APPROVAL")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .addHelpText("after", HELP)
    .action(async (id: string, cmdOpts: { org: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/await-approval`,
          body: { organizationId: cmdOpts.org }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
