import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { addPaginationOptions, getPaginationParams } from "../../../util/pagination";

const DATASET_LIST_HELP = `
Examples:
  $ nexus task-eval dataset list 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus task-eval dataset list 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --limit 20
  $ nexus task-eval dataset list 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  THREE COLUMNS, AND THE RESULTS ARE NOT AMONG THEM. This is the INPUT side —
  the rows an execution will run. Scores and outputs come from "task-eval
  results".
  input and expectedOutput each accept a string OR an object, so a cell showing
  JSON is a real nested value and not a string that looks like one. --json is
  where that distinction survives; the table flattens it to fit a column.
  expectedOutput may be empty — a row without one still executes, and only the
  judge needs something to compare against.
  Paginated: --limit and the meta block bound what you are seeing.`;

/** `nexus task-eval dataset list` — reaches a route the v1 contract does not declare. */
export function registerEvaluationDatasetListCommand(dataset: Command, program: Command): Command {
  return addPaginationOptions(
    dataset
      .command("list")
      .description("List dataset rows")
      .argument("<task-id>", "Task ID")
      .argument("<session-id>", "Session ID")
      .addHelpText("after", DATASET_LIST_HELP)
  ).action(async (taskId: string, sessionId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.evaluations.getDatasetRows(taskId, sessionId, {
        ...getPaginationParams(opts)
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "input", label: "INPUT", width: 40 },
        { key: "expectedOutput", label: "EXPECTED OUTPUT", width: 40 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
}
