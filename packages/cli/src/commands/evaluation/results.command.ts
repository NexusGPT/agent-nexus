import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";

const RESULTS_HELP = `
Examples:
  $ nexus task-eval results 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval results 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --limit 50
  $ nexus task-eval results 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  THE TABLE SHOWS 5 OF 11 FIELDS AND HIDES THE ONE THAT EXPLAINS A BLANK SCORE.
  A row carries rowId, input, expectedOutput, actualOutput, score, judgeComment,
  executionTimeMs, status, judgeStatus, executionError and judgeError; the table
  prints rowId, input, actualOutput, score and status.

  status IS EXECUTION AND judgeStatus IS SCORING, and the two move
  independently. A row reads status COMPLETED with score blank for as long as
  judgeStatus is PENDING, which is every row until "nexus task-eval judge" runs.
  Read judgeStatus before you read score.

  A REAL FAILURE NAMES ITSELF, UNDER --json ONLY: executionError for the run,
  judgeError for the scoring. Both null beside a blank score means not judged
  yet, never failed.`;

/** `nexus task-eval results` — reaches a route the v1 contract does not declare. */
export function registerEvaluationResultsCommand(eval_: Command, program: Command): Command {
  return addPaginationOptions(
    eval_
      .command("results")
      .description("Get evaluation results")
      .argument("<task-id>", "Task ID")
      .argument("<session-id>", "Session ID")
      .addHelpText("after", RESULTS_HELP)
  ).action(async (taskId: string, sessionId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.evaluations.getResults(taskId, sessionId, {
        ...getPaginationParams(opts)
      });

      printList(data, meta, [
        { key: "rowId", label: "ROW ID", width: 36 },
        { key: "input", label: "INPUT", width: 30 },
        { key: "actualOutput", label: "OUTPUT", width: 30 },
        { key: "score", label: "SCORE", width: 8 },
        { key: "status", label: "STATUS", width: 12 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
}
