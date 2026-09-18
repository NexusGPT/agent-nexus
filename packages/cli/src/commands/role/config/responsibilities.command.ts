import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role responsibilities` */
export function registerRoleResponsibilitiesCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("responsibilities")
    .description("List a Role's duties — what it is answerable for")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role responsibilities "Support agent"

Notes:
  POSITION IS AN INSERTION ORDER, NOT A RANK. Removing a duty leaves a hole
  (0, 1, 3) and nothing backfills it, so read the list rather than the number.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.listResponsibilities(await resolveRoleId(client, ref));

        printList(result.responsibilities, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "position", label: "POS", width: 5 },
          { key: "text", label: "DUTY", width: 70 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
