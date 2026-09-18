import type { RoleTaskDutiesBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role set-task-duties` */
export function registerRoleSetTaskDutiesCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("set-task-duties")
    .description("REPLACE the set of duties one task ticks")
    .argument("<role>", "Role name or UUID")
    .argument("<task-id>", 'Task UUID — read it from "nexus role tasks"')
    .requiredOption("--body <json>", "{ responsibilityIds: [...] } as JSON, .json file, or '-'")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role set-task-duties "Support" 3f2b1a09-8f7e-4d6c-9b4a-39281706f5e4 --body '{"responsibilityIds":["a1b2..."]}'
  $ nexus role set-task-duties "Support" 3f2b1a09-8f7e-4d6c-9b4a-39281706f5e4 --body '{"responsibilityIds":[]}'

Notes:
  THIS REPLACES THE WHOLE SET. An empty array unticks every duty and answers
  success, which is the correct request for clearing the last tick rather than
  an accident.

  Every id is checked against THIS Role first. A duty belonging to another Role
  is refused with a COUNT, never the ids. The same duty twice is refused
  outright — the database could not store it.`
    )
    .action(async (ref: string, taskId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const body = await resolveRequiredBody(String(opts.body));
        const result = await client.roles.replaceTaskDuties(
          roleId,
          taskId,
          asRequestBody<RoleTaskDutiesBody>(body)
        );

        printSuccess("Duty ticks replaced.", { duties: result.responsibilityIds.length });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
