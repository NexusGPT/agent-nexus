import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role task-duties` */
export function registerRoleTaskDutiesCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("task-duties")
    .description("List the duties one task ticks")
    .argument("<role>", "Role name or UUID")
    .argument("<task-id>", 'Task UUID — read it from "nexus role tasks"')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role tasks "Support" --json            # read the task ids
  $ nexus role task-duties "Support" 3f2b1a09-8f7e-4d6c-9b4a-39281706f5e4

Notes:
  IDS ONLY, NEVER THE DUTY TEXT. The text has one home and a different scope:
  read it with "nexus role responsibilities" and match on the id. Both reads are
  required to show a checklist a human can read.

  Ordered by the duty's own position, never by the link and never by the order
  anyone ticked them.`
    )
    .action(async (ref: string, taskId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const result = await client.roles.listTaskDuties(roleId, taskId);

        printList(
          result.responsibilityIds.map((id) => ({ responsibilityId: id })),
          undefined,
          [{ key: "responsibilityId", label: "DUTY ID", width: 36 }]
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
