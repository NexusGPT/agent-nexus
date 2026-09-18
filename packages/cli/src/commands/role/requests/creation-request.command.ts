import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";

/** `nexus role creation-request` */
export function registerRoleCreationRequestCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("creation-request")
    .description("Show one filed Role-creation request")
    .argument("<request-id>", "Request UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role creation-request 44444444-4444-4444-8444-444444444444

Notes:
  CREATED ROLE is null until the request is approved, and holds the new Role's
  id afterwards — so this is how a caller learns the id of the Role its own
  request produced.`
    )
    .action(async (requestId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { request } = await client.roles.getCreationRequest(requestId);

        printRecord(request, [
          { key: "id", label: "Request" },
          { key: "status", label: "Status" },
          { key: "name", label: "Proposed name" },
          { key: "jobDescription", label: "Job description" },
          { key: "ownerUserId", label: "Proposed owner" },
          { key: "requestedByUserId", label: "Requested by" },
          { key: "reviewedByUserId", label: "Reviewed by" },
          { key: "createdRoleId", label: "Created role" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
