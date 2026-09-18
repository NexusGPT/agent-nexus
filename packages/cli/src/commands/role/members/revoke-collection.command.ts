import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role revoke-collection` */
export function registerRoleRevokeCollectionCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("revoke-collection")
    .description("Remove a Role's access to a knowledge collection")
    .argument("<role>", "Role name or UUID")
    .argument("<grant-id>", "The GRANT row's UUID — not the collection's")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role revoke-collection "Support agent" 33333333-3333-4333-8333-333333333333

Notes:
  Takes the GRANT id, which "nexus role collection-grants" prints in the first
  column. Passing the collection id instead matches nothing.
  Idempotent: removed=false for a grant that was already gone.`
    )
    .action(async (ref: string, grantId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.revokeCollection(
          await resolveRoleId(client, ref),
          grantId
        );

        printSuccess(
          result.removed
            ? "Collection revoked."
            : 'No such grant. Nothing was removed. The id must be the GRANT row\'s, which "nexus role collection-grants" prints in the first column — a COLLECTION id matches nothing here.',
          { removed: result.removed }
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
