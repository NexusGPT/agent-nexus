import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

const EXECUTE_HELP = `
Examples:
  $ nexus task-eval execute 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval execute 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  IT RUNS THE TASK FOR REAL, once per dataset row, with whatever the task is
  configured to do. There is no dry mode, and the cost scales with the row count.
  EXECUTION IS NOT SCORING. This produces outputs; "task-eval judge" is what
  compares them to expectedOutput. A session that executed and was never judged
  has results with no scores, which is a normal intermediate state.
  Add the rows FIRST — executing an empty dataset runs nothing and still
  succeeds.
  Read the outcome with "task-eval results"; this answers with the run's own
  record rather than the per-row output.`;

/** `nexus task-eval execute` — reaches a route the v1 contract does not declare. */
export function registerEvaluationExecuteCommand(eval_: Command, program: Command): Command {
  return eval_
    .command("execute")
    .description("Execute an evaluation run")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .addHelpText("after", EXECUTE_HELP)
    .action(async (taskId: string, sessionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.evaluations.execute(taskId, sessionId);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
