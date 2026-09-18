import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import {
  ROLES_LIST_ACCESS_REQUESTS__PARAMS_STATUS,
  ROLES_LIST_ACCESS_REQUESTS_CONTRACT
} from "../../role.contract.generated";
import { foldUpper } from "../_shared/fold-upper";
import { readAccessRequestStatus } from "../_shared/read-access-request-status";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role access-requests` */
export function registerRoleAccessRequestsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("access-requests")
    .description("List requests for access to one of a Role's systems")
    .argument("<role>", "Role name or UUID")
    .addOption(
      enumOption(
        "--status <status>",
        "Filter by request status",
        ROLES_LIST_ACCESS_REQUESTS__PARAMS_STATUS,
        undefined,
        foldUpper
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role access-requests "Support agent" --status PENDING

Notes:
  THIS TABLE ACCUMULATES and the route has no pagination — a reviewed request
  is kept with its verdict rather than deleted, so the unfiltered read grows
  for the lifetime of the Role. Poll with --status PENDING, which is bounded by
  how fast the organization reviews.
  Seeing the queue and deciding an item are separate permissions; this API
  ships only the seeing.`
    )
    .action(async (ref: string, opts: { status?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const status = readAccessRequestStatus(opts.status);
        const { requests } = await client.roles.listAccessRequests(
          await resolveRoleId(client, ref),
          { status }
        );

        printList(requests, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "status", label: "STATUS", width: 9 },
          { key: "resourceType", label: "TYPE", width: 18 },
          { key: "resourceId", label: "SYSTEM", width: 36 },
          { key: "requestedByUserId", label: "BY", width: 32 },
          { key: "createdAt", label: "ASKED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_LIST_ACCESS_REQUESTS_CONTRACT);
  return leaf;
}
