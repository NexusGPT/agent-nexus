import { Command } from "commander";

import { registerExecutionCancelCommand } from "./execution/cancel.command";
import { registerExecutionDiagnoseCommand } from "./execution/diagnose.command";
import { registerExecutionExportCommand } from "./execution/export.command";
import { registerExecutionFollowCommand } from "./execution/follow.command";
import { registerExecutionGetCommand } from "./execution/get.command";
import { registerExecutionListCommand } from "./execution/list.command";
import { registerExecutionNodeResultCommand } from "./execution/node-result.command";
import { registerExecutionOutputCommand } from "./execution/output.command";
import { registerExecutionPollCommand } from "./execution/poll.command";
import { registerExecutionRetryCommand } from "./execution/retry.command";

export function registerExecutionCommands(program: Command): void {
  const execution = program.command("execution").description("View workflow execution history");

  execution.addHelpText(
    "after",
    `
An execution id is a WorkflowExecution UUID. "workflow node test" hands back a
different key — a per-node test id — and EVERY VERB HERE THAT TAKES AN EXECUTION
ID ACCEPTS IT: get, poll, follow, diagnose, node-result, output, retry, cancel and
export resolve it to the parent execution and answer for that, reporting the
execution's own canonical id. So the id a node test returned is a usable argument,
not a 404. ("list" takes no id; --include-test-runs is what surfaces the row.)

Two facts that decide whether you are reading the right thing:
  • THE PER-NODE STATUS ENUM IS NOT THE EXECUTION ENUM. An execution is PENDING,
    RUNNING, COMPLETED, FAILED or CANCELLED. A NODE is PENDING, READY, RUNNING,
    COMPLETED, SKIPPED, WAITING or ERROR — a failed node reads ERROR, never
    FAILED, so filtering per-node results for FAILED silently finds nothing.
  • "execution list" HIDES loop passes and node tests by default. Each pass of a
    loop body and each builder node test is its own execution row, so a count you
    read here is real runs — until you ask for the others, at which point the
    TYPE column is the only thing telling them apart.`
  );

  registerExecutionListCommand(execution, program);
  registerExecutionGetCommand(execution, program);
  registerExecutionDiagnoseCommand(execution, program);
  registerExecutionPollCommand(execution, program);
  registerExecutionFollowCommand(execution, program);
  registerExecutionOutputCommand(execution, program);
  registerExecutionCancelCommand(execution, program);
  registerExecutionRetryCommand(execution, program);
  registerExecutionExportCommand(execution, program);
  registerExecutionNodeResultCommand(execution, program);
}
