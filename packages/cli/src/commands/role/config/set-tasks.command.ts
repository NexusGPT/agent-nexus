import type { RoleTasksBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";
import { resolveRoleId } from "../_shared/resolve-role-id";
import { ASSIGNMENT_KIND_NAMES, RESOURCE_TYPE_NAMES } from "../_shared/role-kinds";

/** `nexus role set-tasks` */
export function registerRoleSetTasksCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("set-tasks")
    .description("REPLACE a Role's task list")
    .argument("<role>", "Role name or UUID")
    .requiredOption(
      "--body <json>",
      "{ tasks: [...] } — Notes name every key — as JSON, a .json file, or '-' for stdin"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role tasks "Support" --json > tasks.json   # read first
  $ nexus role set-tasks "Support" --body ./tasks.json

Notes:
  THE BODY IS { "tasks": [ ... ] } AND A TASK IS:

    { "id": "<uuid — OMIT to create>", "name": "Answer the phone",
      "description": null, "occurrencesPerYear": null, "peoplePerYear": null,
      "revenuePerYear": null, "assignments": [] }

  Every key but "id" is required. null is how you say "nobody stated this" and
  is NOT zero — a defaulted 0 prices unfinished work as free.

  AN ASSIGNMENT IS AN OBJECT KEYED BY "kind" (${ASSIGNMENT_KIND_NAMES}), never a
  "<type>:<id>" string:

    { "kind": "person",   "userId": "<user id>" }
    { "kind": "resource", "resourceType": "agent", "resourceId": "<uuid>" }

  A "resourceType" is one of these:
    ${RESOURCE_TYPE_NAMES}

  A "kind" outside that pair is refused naming both of them; a "resourceType"
  outside that list is refused naming the list. An assignment carries no id and
  needs none: its arm is its identity.

  THIS REPLACES THE WHOLE LIST. Anything absent from "tasks" is DELETED and the
  answer is still a success. Read, modify, send the whole list back. The array
  index is the position, so a reorder is the same request with the elements
  moved.

  SEND EACH TASK'S id BACK. A task carrying its id is updated in place and keeps
  it; one without an id is created. Keeping the id is what keeps that task's
  ticked duties attached — a re-minted id takes every tick with it. This is the
  single most expensive thing to get wrong here, and dropping the ids still
  answers success.

  Every id is checked against this Role and this organization first. A foreign
  task, person or system is refused with a COUNT, never the ids.`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const body = await resolveRequiredBody(String(opts.body));
        const result = await client.roles.replaceTasks(roleId, asRequestBody<RoleTasksBody>(body));

        printSuccess("Task list replaced.", { tasks: result.tasks.length });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
