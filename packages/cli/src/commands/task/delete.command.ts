import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/** `nexus task delete` — refused while an agent skill or live workflow holds it. */
export function registerTaskDeleteCommand(task: Command, program: Command): void {
  confirmable(task.command("delete"))
    .description("Delete an AI task")
    .argument("<id>", "Task ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task delete 11111111-1111-4111-8111-111111111111
  $ nexus task delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  Fails with 409 if the task is still attached to an agent skill or a
  NON-ARCHIVED workflow. Detach it from those dependents (listed in the error)
  before deleting.
  ARCHIVING THE WORKFLOW RELEASES THE TASK. A workflow stops counting as a
  dependent once it is archived, so "nexus workflow delete <workflow-id>" —
  which archives rather than destroys — clears a 409 you cannot otherwise get
  past. Archiving is permanent, so do it because you meant to retire the
  workflow, not merely to unblock this delete.

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete task ${id}?`, opts))) return;

        await client.skills.deleteTask(id);
        printSuccess("Task deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
