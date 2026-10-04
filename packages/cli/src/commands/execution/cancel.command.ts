import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { WORKFLOW_EXECUTION_CANCEL_CONTRACT } from "../execution.contract.generated";

/** `nexus execution cancel` — stop a run in flight. */
export function registerExecutionCancelCommand(execution: Command, program: Command): void {
  const cancel = execution
    .command("cancel")
    .description("Cancel a running execution and its in-flight loop iterations")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Cancels a PENDING, RUNNING or FAILED execution. Loop fan-outs run as child
executions, so every iteration the run spawned is cancelled with it.

Examples:
  $ nexus execution cancel 11111111-1111-4111-8111-111111111111
  $ nexus execution cancel 11111111-1111-4111-8111-111111111111 --json

Notes:
  IT STOPS THE EXECUTOR, NOT JUST THE ROW. The in-memory run is halted and every
  loop-iteration child is cancelled, which is what stops a runaway loop from
  continuing to fire external calls.
  IT DOES NOT UNDO WHAT ALREADY HAPPENED. Emails sent, rows written and payments
  taken by nodes that already completed stay done — cancelling is stopping, not
  rolling back.
  No confirmation prompt and no --dry-run: it acts immediately.
  Answers {success, message}. Cancelling a run that has already finished reports
  the refusal in that message rather than throwing.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflowExecutions.cancel(id);
        printSuccess("Execution cancelled.", { executionId: id, ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(cancel, WORKFLOW_EXECUTION_CANCEL_CONTRACT);
}
