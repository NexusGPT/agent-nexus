import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role add-responsibility` */
export function registerRoleAddResponsibilityCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("add-responsibility")
    .description("Add ONE duty to a Role")
    .argument("<role>", "Role name or UUID")
    .argument("<text>", "The duty, in your own words")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role add-responsibility "Support" "Answer billing disputes under 200 euros"

Notes:
  ONE PER CALL, AND THERE IS NO WHOLE-LIST REPLACE. That is deliberate: a
  replace re-mints every row id on every save, and a duty has to stay
  referenceable because a task's duty checklist points at it. Seeding
  several duties means several calls.

  The server assigns the id and appends at the END of the list. Blank text is
  refused; 500 characters is the ceiling — anything longer is a job
  description, which belongs on "nexus role update --job-description".`
    )
    .action(async (ref: string, text: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const duty = await client.roles.addResponsibility(roleId, { text });

        printSuccess("Duty added.", { id: duty.id, position: duty.position, text: duty.text });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
