import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess, printWarning } from "../../../output";
import {
  ROLE_DELETION_REQUESTS_REVIEW__BODY_STATUS,
  ROLE_DELETION_REQUESTS_REVIEW_CONTRACT
} from "../../role.contract.generated";
import { describeRole, roleNamesById } from "../_shared/describe-role";
import { foldUpper } from "../_shared/fold-upper";
import { readVerdict } from "../_shared/read-verdict";

/** `nexus role review-deletion-request` */
export function registerRoleReviewDeletionRequestCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("review-deletion-request")
    .description("Approve or reject a filed Role-deletion request")
    .argument("<request-id>", "Request UUID")
    .addOption(
      enumOption(
        "--status <verdict>",
        "Verdict",
        ROLE_DELETION_REQUESTS_REVIEW__BODY_STATUS,
        undefined,
        foldUpper
      ).makeOptionMandatory()
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role review-deletion-request 55555555-5555-4555-8555-555555555555 --status APPROVED

Notes:
  APPROVING IS WHAT DELETES THE ROLE, and it ORPHANS every system the Role held
  — they keep existing and keep running, reachable by nothing that resolves
  access through a Role, reporting no error. Run
  "nexus role systems <role>" first and move what matters.

  On APPROVED it prints a warning naming the Role — its NAME and its UUID. The
  name is read BEFORE the deletion, because a deletion request carries only the
  Role's id and nothing can resolve the name afterwards. Without the roles:read
  scope the warning still prints, with the UUID alone.`
    )
    .action(async (requestId: string, opts: { status: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const verdict = readVerdict(String(opts.status));
        // Read the names BEFORE the review, and only when approving. Approving is
        // what DELETES the Role, and `RoleDeletionRequest` carries only `roleId` —
        // so after the call there is no name left anywhere to resolve. A rejection
        // deletes nothing and prints no warning, so it pays for no lookup.
        const names =
          verdict === "APPROVED" ? await roleNamesById(client) : new Map<string, string>();
        const { request } = await client.roles.reviewDeletionRequest(requestId, {
          status: verdict
        });

        printSuccess("Deletion request reviewed.", { id: request.id, status: request.status });
        if (request.status === "APPROVED") {
          printWarning(
            `Role ${describeRole(names, request.roleId)} is gone, and every system it held is now an ORPHAN.`,
            "They still exist and still run, in no Role, reachable by nothing that resolves",
            "access through one. Nothing else reports this."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLE_DELETION_REQUESTS_REVIEW_CONTRACT);
  return leaf;
}
