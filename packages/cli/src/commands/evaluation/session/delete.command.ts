import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";

const SESSION_DELETE_HELP = `
Examples:
  $ nexus task-eval session delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval session delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --yes

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  IT TAKES THE DATASET AND THE RESULTS WITH IT. The session's rows and every
  score judged against them go too, and there is no reset or re-run, so a
  deleted session means executing and judging again from a new one. Read what
  you need with "task-eval results" first.`;

/** `nexus task-eval session delete` — reaches a route the v1 contract does not declare. */
export function registerEvaluationSessionDeleteCommand(
  session: Command,
  program: Command
): Command {
  return confirmable(session.command("delete"))
    .description("Delete an evaluation session")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .addHelpText("after", SESSION_DELETE_HELP)
    .action(async (taskId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete evaluation session ${sessionId}?`, opts))) return;

        await client.evaluations.deleteSession(taskId, sessionId);
        printSuccess("Evaluation session deleted.", { sessionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
