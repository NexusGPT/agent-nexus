import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { addPaginationOptions, getPaginationParams } from "../../../util/pagination";
import { EVALUATION_LIST_CONTRACT } from "../../task-eval.contract.generated";

const SESSION_LIST_HELP = `
Examples:
  $ nexus task-eval session list 11111111-1111-4111-8111-111111111111
  $ nexus task-eval session list 11111111-1111-4111-8111-111111111111 --limit 10
  $ nexus task-eval session list 11111111-1111-4111-8111-111111111111 --json

Notes:
  SCOPED TO ONE TASK — the argument is the task id, and sessions belonging to
  other tasks are not listed here.
  STATUS IS THE EXECUTION'S, NOT THE JUDGE'S. The two move independently, so a
  session can read complete here and still carry no score. "session get" is where
  the judge's side shows.
  THIS ROW IS A SMALLER SHAPE THAN "session get" RETURNS. averageScore,
  judgedRows, judgeFailedRows, judgeModel and judgePrompt are ABSENT from a list
  row rather than null — do not read their absence as zero.
  The ID column is what "dataset", "execute", "judge" and "results" all take.`;

/** `nexus task-eval session list` */
export function registerEvaluationSessionListCommand(session: Command, program: Command): Command {
  const sessionList = addPaginationOptions(
    session
      .command("list")
      .description("List evaluation sessions")
      .argument("<task-id>", "Task ID")
      .addHelpText("after", SESSION_LIST_HELP)
  ).action(async (taskId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.evaluations.listSessions(taskId, {
        ...getPaginationParams(opts)
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 30 },
        { key: "status", label: "STATUS", width: 15 },
        { key: "createdAt", label: "CREATED", width: 26 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  bindCommand(sessionList, EVALUATION_LIST_CONTRACT);
  return sessionList;
}
