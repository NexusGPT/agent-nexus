import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import {
  ROLE_CREATION_REQUESTS_LIST__PARAMS_STATUS,
  ROLE_CREATION_REQUESTS_LIST_CONTRACT
} from "../../role.contract.generated";
import { foldUpper } from "../_shared/fold-upper";
import { readAccessRequestStatus } from "../_shared/read-access-request-status";

/** `nexus role creation-requests` */
export function registerRoleCreationRequestsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("creation-requests")
    .description("List filed requests to CREATE a Role")
    .addOption(
      enumOption(
        "--status <status>",
        "Filter by request status",
        ROLE_CREATION_REQUESTS_LIST__PARAMS_STATUS,
        undefined,
        foldUpper
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role creation-requests --status PENDING

Notes:
  Every row is a Role that DOES NOT EXIST yet. This is the poll route that makes
  a governed create drivable without org-admin rights.`
    )
    .action(async (opts: { status?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { requests } = await client.roles.listCreationRequests({
          status: readAccessRequestStatus(opts.status)
        });

        printList(requests, undefined, [
          { key: "id", label: "REQUEST", width: 36 },
          { key: "status", label: "STATUS", width: 9 },
          { key: "name", label: "PROPOSED NAME", width: 24 },
          { key: "requestedByUserId", label: "BY", width: 30 },
          { key: "createdRoleId", label: "CREATED ROLE", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLE_CREATION_REQUESTS_LIST_CONTRACT);
  return leaf;
}
