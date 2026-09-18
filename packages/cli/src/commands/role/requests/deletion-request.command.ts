import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";

/** `nexus role deletion-request` */
export function registerRoleDeletionRequestCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("deletion-request")
    .description("Show one filed Role-deletion request")
    .argument("<request-id>", "Request UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role deletion-request 55555555-5555-4555-8555-555555555555

Notes:
  PENDING MEANS THE ROLE IS STILL THERE. A filed request is not a deletion —
  the Role, its systems and its members are untouched until somebody approves
  it with "nexus role review-deletion-request".
  Takes the REQUEST id, which "nexus role deletion-requests" prints first — not
  the Role's.
  A reviewed request is KEPT with its verdict rather than deleted, so a row
  here can be APPROVED and long since acted on.`
    )
    .action(async (requestId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { request } = await client.roles.getDeletionRequest(requestId);

        printRecord(request, [
          { key: "id", label: "Request" },
          { key: "status", label: "Status" },
          { key: "roleId", label: "Role" },
          { key: "requestedByUserId", label: "Requested by" },
          { key: "reviewedByUserId", label: "Reviewed by" },
          { key: "reviewedAt", label: "Reviewed at" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
