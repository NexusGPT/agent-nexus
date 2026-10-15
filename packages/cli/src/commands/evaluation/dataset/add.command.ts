import type { AddEvalDatasetRowBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";

const DATASET_ADD_HELP = `
Examples:
  $ nexus task-eval dataset add 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --body '{"input":"Hello","expectedOutput":"Hi there"}'
  $ nexus task-eval dataset add 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --body dataset-row.json

Notes:
  ONE CALL, ONE ROW. This is the only way to fill a dataset from the CLI — there
  is no import command and no file argument here, so a 100-row dataset is 100
  calls. The extensions "task-eval formats" lists are not accepted by any
  command in this namespace.
  metadata IS ACCEPTED AND NOT STORED. The body schema takes it, the call
  answers 201, and every later read of that row shows metadata null. Put
  anything you need to keep inside "input" instead.
  ADD ROWS WHILE THE SESSION IS STILL DRAFT. Nothing refuses a row added after
  "execute" — it is created, it is never evaluated, and no result row ever
  appears for it.
  Rows are numbered in the order they arrive and "dataset list" returns them
  that way.
  A ROW IS input, expectedOutput AND metadata, AND ONLY input IS REQUIRED. A
  body without it is a 400 naming that field. input and expectedOutput each
  accept a STRING OR AN OBJECT, so a structured task takes the object form
  directly with no stringify; metadata must be an object, and is the field
  discarded above.`;

/** `nexus task-eval dataset add` — reaches a route the v1 contract does not declare. */
export function registerEvaluationDatasetAddCommand(dataset: Command, program: Command): Command {
  return dataset
    .command("add")
    .description("Add a row to the evaluation dataset")
    .argument("<task-id>", "Task ID")
    .argument("<session-id>", "Session ID")
    .requiredOption("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", DATASET_ADD_HELP)
    .action(async (taskId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `AddEvalDatasetRowBody.input` is required, so there is no usable
        // default: omitting `--body` could only ever produce a server 400.
        // That is why `--body` is a requiredOption above: commander refuses
        // before this action runs, with a usage message, rather than the action
        // hand-rolling a refusal `--help` gave no warning of.
        const body = await resolveRequiredBody(opts.body);

        const row = await client.evaluations.addDatasetRow(
          taskId,
          sessionId,
          asRequestBody<AddEvalDatasetRowBody>(body)
        );
        printRecord(row, [
          { key: "id", label: "ID" },
          { key: "input", label: "Input" },
          { key: "expectedOutput", label: "Expected Output" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
