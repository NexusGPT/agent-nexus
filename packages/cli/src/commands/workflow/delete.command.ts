import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printDryRun, printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { WORKFLOW_DELETE_HELP } from "./copy/delete-help";

/** `nexus workflow delete` — archives rather than destroys. */
export function registerWorkflowDeleteCommand(workflow: Command, program: Command): void {
  confirmable(workflow.command("delete"))
    .description("Delete a workflow")
    .argument("<id>", "Workflow ID")
    .option("--dry-run", "Preview without deleting")
    .addHelpText("after", WORKFLOW_DELETE_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.dryRun) {
          const wf = await client.workflows.get(id);
          printDryRun(`Would delete workflow "${wf.name}" (${id})`, { id });
          return;
        }

        if (!(await confirmDestructive(`Delete workflow ${id}? This cannot be undone.`, opts)))
          return;

        await client.workflows.delete(id);
        printSuccess("Workflow deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
