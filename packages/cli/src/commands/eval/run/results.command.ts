import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope } from "../../../output";
import { PROMPT_EVAL_RUN_RESULTS_CONTRACT } from "../../eval.contract.generated";
import { renderResultsMatrix } from "./render/results-matrix";

const RUN_RESULTS_HELP = `
Examples:
  $ nexus eval run results --run-id 77777777-7777-4777-8777-777777777777
  $ nexus eval run results --run-id 77777777-7777-4777-8777-777777777777 --json

Notes:
  ROWS ARE CHECKPOINTS grouped by conversation, COLUMNS ARE VARIANTS, and
  each cell shows the mean golden_match score plus P (pass) or F (fail).
  FAIL! means the cell could not run at all; ? means nothing scored it.
  THE DELTA ROW APPEARS ONLY WITH A BASELINE. A variants-only run has
  nothing to compare against, so .rollup.variants[] carries no
  deltaVsBaseline key at all rather than a null one.
  Under --json, .cases[] carries every cell with its scores — that is where
  a case id for "eval run get --case" comes from.`;

/** `nexus eval run results` */
export function registerEvalRunResultsCommand(run: Command, program: Command): Command {
  const runResults = run
    .command("results")
    .description("The matrix: checkpoints x variants, with the per-variant rollup")
    .requiredOption("--run-id <id>", "Eval run id")
    .addHelpText("after", RUN_RESULTS_HELP)
    .action(async (opts: { runId: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptEvalRuns.results(opts.runId);
        printEnvelope(result, () => renderResultsMatrix(result));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(runResults, PROMPT_EVAL_RUN_RESULTS_CONTRACT);
  return runResults;
}
