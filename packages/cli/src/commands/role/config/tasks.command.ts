import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";
import { ASSIGNMENT_KIND_NAMES, RESOURCE_TYPE_NAMES } from "../_shared/role-kinds";

/** `nexus role tasks` */
export function registerRoleTasksCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("tasks")
    .description("List a Role's proposed tasks and their assignments")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role tasks "Support agent"

Notes:
  A TASK ID IS DURABLE — a task saved with its id is updated in place and keeps
  it. AN ASSIGNMENT HAS NO ID ON THIS CONTRACT AT ALL, and that is enforced
  rather than merely omitted: a payload carrying one is refused. Its ARM is its
  identity, and an arm is an OBJECT keyed by "kind" — ${ASSIGNMENT_KIND_NAMES}:

    { "kind": "person",   "userId": "<user id>" }
    { "kind": "resource", "resourceType": "agent", "resourceId": "<uuid>" }

  A "resourceType" is one of these:
    ${RESOURCE_TYPE_NAMES}

  THERE IS NO "person:<userId>" STRING FORM, and sending one is refused. That
  spelling is the DATABASE's uniqueness key on the assignment row, never the
  wire.

  THE WRITE IS "set-tasks", AND IT REPLACES THE WHOLE LIST. Send each task's id
  back or that task is deleted and re-created, which takes its ticked duties with
  it. There is still no graduation verb: that one is refused outright rather than
  merely absent, and the public contract carries the reason.

  ASSIGNMENTS carry the ids they point AT and no display names. Resolve a person
  with "nexus role members" and a system with "nexus role systems".`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.listTasks(await resolveRoleId(client, ref));

        // THE ROWS GO IN WHOLE, and the count is a COLUMN `format`. Rewriting
        // `assignments` to its length before this call would reach `--json` too —
        // printList dumps its rows as-is there — so a scripted caller would get a
        // number where the help text above tells it to resolve the ids. The table
        // still needs a count, because a column cannot render the union arms.
        printList(result.tasks, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "position", label: "POS", width: 5 },
          { key: "name", label: "TASK", width: 44 },
          { key: "occurrencesPerYear", label: "OCC/YR", width: 8 },
          { key: "peoplePerYear", label: "PPL/YR", width: 8 },
          {
            key: "assignments",
            label: "ASSIGNED",
            width: 9,
            format: (val) => (Array.isArray(val) ? String(val.length) : "0")
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
