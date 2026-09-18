import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { absent, printSuccess } from "../../../output";
import {
  ROLE_CREATION_REQUESTS_REVIEW__BODY_STATUS,
  ROLE_CREATION_REQUESTS_REVIEW_CONTRACT
} from "../../role.contract.generated";
import { foldUpper } from "../_shared/fold-upper";
import { readVerdict } from "../_shared/read-verdict";

/** `nexus role review-creation-request` */
export function registerRoleReviewCreationRequestCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("review-creation-request")
    .description("Approve or reject a filed Role-creation request")
    .argument("<request-id>", "Request UUID")
    .addOption(
      enumOption(
        "--status <verdict>",
        "Verdict",
        ROLE_CREATION_REQUESTS_REVIEW__BODY_STATUS,
        undefined,
        foldUpper
      ).makeOptionMandatory()
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role review-creation-request 44444444-4444-4444-8444-444444444444 --status APPROVED

Notes:
  APPROVING IS WHAT CREATES THE ROLE. This is the write itself, not bookkeeping
  on a write that already happened. The new Role's id comes back as CREATED
  ROLE.`
    )
    .action(async (requestId: string, opts: { status: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { request } = await client.roles.reviewCreationRequest(requestId, {
          status: readVerdict(String(opts.status))
        });

        printSuccess("Creation request reviewed.", {
          id: request.id,
          status: request.status,
          // Null on a REJECTED verdict, and on an APPROVED one it is the id of
          // the Role the request produced — the only place a caller learns it.
          createdRoleId: request.createdRoleId ?? absent("(nothing created)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLE_CREATION_REQUESTS_REVIEW_CONTRACT);
  return leaf;
}
