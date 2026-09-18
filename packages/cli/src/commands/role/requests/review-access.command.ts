import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import {
  ROLE_ACCESS_REQUESTS_REVIEW__BODY_STATUS,
  ROLE_ACCESS_REQUESTS_REVIEW_CONTRACT
} from "../../role.contract.generated";
import { foldUpper } from "../_shared/fold-upper";
import { readVerdict } from "../_shared/read-verdict";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role review-access` */
export function registerRoleReviewAccessCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("review-access")
    .description("Approve or reject an access request")
    .argument("<role>", "Role name or UUID")
    .argument("<request-id>", "Request UUID")
    .addOption(
      enumOption(
        "--status <verdict>",
        "Verdict",
        ROLE_ACCESS_REQUESTS_REVIEW__BODY_STATUS,
        undefined,
        foldUpper
      ).makeOptionMandatory()
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role review-access "Support" 33333333-3333-4333-8333-333333333333 --status APPROVED

Notes:
  PENDING is the starting state and never a target, so only the two verdicts are
  accepted. Deciding is a SEPARATE permission from seeing the queue: a key that
  can list requests may still be refused here.`
    )
    .action(async (ref: string, requestId: string, opts: { status: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { request } = await client.roles.reviewAccessRequest(
          await resolveRoleId(client, ref),
          requestId,
          { status: readVerdict(String(opts.status)) }
        );

        printSuccess("Access request reviewed.", { id: request.id, status: request.status });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLE_ACCESS_REQUESTS_REVIEW_CONTRACT);
  return leaf;
}
