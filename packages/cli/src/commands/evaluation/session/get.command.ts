import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";

const SESSION_GET_HELP = `
Examples:
  $ nexus task-eval session get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval session get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  THIS COMMAND AND "session list" RETURN DIFFERENT SHAPES, and the difference is
  every scoring field. A list row carries id, name, description, status, taskId,
  datasetRowCount, completedRows, failedRows, createdAt and updatedAt. This one
  adds averageScore, judgedRows, judgeFailedRows, judgeModel and judgePrompt.
  Those five are ABSENT from a list row rather than null, so a scored session
  reads a score here and nothing at all there — never poll "session list" for
  one.

  THE TABLE HERE DROPS THEM AGAIN. It prints id, name, description, status,
  Rows and Created; averageScore, judgedRows, judgeFailedRows, completedRows and
  failedRows exist under --json alone.

  READ judgeFailedRows BEFORE YOU TRUST averageScore. The average is taken over
  the rows the judge COMPLETED and over nothing else, so a session whose
  judgements mostly errored still reports a confident number, computed from the
  few that survived.`;

/** `nexus task-eval session get` — reaches a route the v1 contract does not declare. */
export function registerEvaluationSessionGetCommand(session: Command, program: Command): Command {
  return session
    .command("get")
    .description("Get evaluation session details")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .addHelpText("after", SESSION_GET_HELP)
    .action(async (taskId: string, sessionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const s = await client.evaluations.getSession(taskId, sessionId);
        printRecord(s, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status" },
          { key: "datasetRowCount", label: "Rows" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
