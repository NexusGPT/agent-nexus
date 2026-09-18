import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role remove-responsibility` */
export function registerRoleRemoveResponsibilityCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("remove-responsibility")
    .description("Remove ONE duty from a Role")
    .argument("<role>", "Role name or UUID")
    .argument("<responsibility-id>", 'Duty UUID — read it from "nexus role responsibilities"')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role responsibilities "Support" --json      # read the ids first
  $ nexus role remove-responsibility "Support" 3f2b1a09-8f7e-4d6c-9b4a-39281706f5e4

Notes:
  IT ALSO UNTICKS THE DUTY FROM EVERY TASK THAT TICKED IT. The link rows go
  with the duty, and this output reports the duty alone.

  A duty that is not this Role's answers 404, so a success means exactly one
  row went. It leaves a hole in POSITION and nothing backfills it.`
    )
    .action(async (ref: string, responsibilityId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const removed = await client.roles.removeResponsibility(roleId, responsibilityId);

        printSuccess("Duty removed.", { id: removed.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
