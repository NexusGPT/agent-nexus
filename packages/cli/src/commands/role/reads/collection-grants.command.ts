import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role collection-grants` */
export function registerRoleCollectionGrantsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("collection-grants")
    .description("List the knowledge collections a Role reaches")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role collection-grants "Support agent"

Notes:
  A grant, not a system: a collection can be shared across several Roles. That
  is one of the two exceptions to a Role's exclusive ownership.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { grants } = await client.roles.listCollectionGrants(
          await resolveRoleId(client, ref)
        );

        printList(grants, undefined, [
          { key: "id", label: "GRANT ID", width: 36 },
          { key: "collectionId", label: "COLLECTION", width: 36 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
