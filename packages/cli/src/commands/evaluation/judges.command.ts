import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { EVALUATION_JUDGES_CONTRACT } from "../task-eval.contract.generated";

const JUDGES_HELP = `
Examples:
  $ nexus task-eval judges
  $ nexus task-eval judges --json

Notes:
  THE ID COLUMN IS WHAT "task-eval judge" TAKES as judgeModel — the display name
  is for reading, and provider only says whose model it is.
  A judge is the model that SCORES an execution, which is a different choice from
  the model the task itself runs on. Picking a strong judge does not change what
  the task produced.
  This list is the platform's and takes no arguments. Omitting judgeModel on
  "task-eval judge" falls back to a default rather than refusing, so an absent
  choice is still a choice.`;

/** `nexus task-eval judges` */
export function registerEvaluationJudgesCommand(eval_: Command, program: Command): Command {
  const judges = eval_
    .command("judges")
    .description("List available judge models")
    .addHelpText("after", JUDGES_HELP)
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.evaluations.listJudges();
        const items = result;

        printList(items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "displayName", label: "NAME", width: 30 },
          { key: "provider", label: "PROVIDER", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(judges, EVALUATION_JUDGES_CONTRACT);
  return judges;
}
