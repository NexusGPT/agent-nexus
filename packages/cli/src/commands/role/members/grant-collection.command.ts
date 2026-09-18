import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role grant-collection` */
export function registerRoleGrantCollectionCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("grant-collection")
    .description("Give a Role access to a knowledge collection")
    .argument("<role>", "Role name or UUID")
    .argument("<collection-id>", "Collection UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role grant-collection "Support agent" 22222222-2222-4222-8222-222222222222

Notes:
  Idempotent — re-granting an already-granted pair returns the existing row.
  A collection can be shared across several Roles, so this is a grant and not
  a move.`
    )
    .action(async (ref: string, collectionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { grant } = await client.roles.grantCollection(await resolveRoleId(client, ref), {
          collectionId
        });

        printSuccess("Collection granted.", {
          grantId: grant.id,
          collectionId: grant.collectionId
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
