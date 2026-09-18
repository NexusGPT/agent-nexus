import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import {
  ROLE_DELETION_REQUESTS_LIST__PARAMS_STATUS,
  ROLE_DELETION_REQUESTS_LIST_CONTRACT
} from "../../role.contract.generated";
import { foldUpper } from "../_shared/fold-upper";
import { readAccessRequestStatus } from "../_shared/read-access-request-status";

/** `nexus role deletion-requests` */
export function registerRoleDeletionRequestsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("deletion-requests")
    .description("List filed requests to DELETE a Role")
    .addOption(
      enumOption(
        "--status <status>",
        "Filter by request status",
        ROLE_DELETION_REQUESTS_LIST__PARAMS_STATUS,
        undefined,
        foldUpper
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role deletion-requests --status PENDING

Notes:
  Every row names a Role that is STILL THERE.`
    )
    .action(async (opts: { status?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { requests } = await client.roles.listDeletionRequests({
          status: readAccessRequestStatus(opts.status)
        });

        printList(requests, undefined, [
          { key: "id", label: "REQUEST", width: 36 },
          { key: "status", label: "STATUS", width: 9 },
          { key: "roleId", label: "ROLE", width: 36 },
          { key: "requestedByUserId", label: "BY", width: 30 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLE_DELETION_REQUESTS_LIST_CONTRACT);
  return leaf;
}
