import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope } from "../../../output";
import { PROMPT_EVAL_RUN_GET_CONTRACT } from "../../eval.contract.generated";
import { renderCaseDetail } from "./render/case-detail";
import { renderRun } from "./render/run-header";

const RUN_GET_HELP = `
Examples:
  $ nexus eval run get --run-id 77777777-7777-4777-8777-777777777777
  $ nexus eval run get --run-id 77777777-7777-4777-8777-777777777777 --json
  $ nexus eval run get --run-id 77777777-7777-4777-8777-777777777777 --case 88888888-8888-4888-8888-888888888888

Notes:
  .rollup IS NULL UNTIL THE RUN SETTLES — poll .status and stop when it is
  no longer QUEUED or RUNNING.
  --case takes an id from "eval run results --json" (.cases[].id) and shows
  the golden reply, the candidate reply, both sides' tool calls, and the
  judge's reasoning per criterion. A criterion judged more than once also
  gets a summary line above its repetitions — the mean score and how many
  repetitions returned the most common verdict, e.g. "mean 0.63  agreement
  2/3 PASS". INCONCLUSIVE repetitions are excluded from both figures.
  .cost is in ten-thousandths of a USD: 1500 means $0.15.`;

/** `nexus eval run get` */
export function registerEvalRunGetCommand(run: Command, program: Command): Command {
  const runGet = run
    .command("get")
    .description("Show a run's status and rollup, or one case with --case")
    .requiredOption("--run-id <id>", "Eval run id")
    .option("--case <caseId>", "Show this cell: golden vs candidate, with judge reasoning")
    .addHelpText("after", RUN_GET_HELP)
    .action(async (opts: { runId: string; case?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (opts.case !== undefined) {
          const detail = await client.promptEvalRuns.getCase(opts.runId, opts.case);
          printEnvelope(detail, () => renderCaseDetail(detail));
          return;
        }
        const result = await client.promptEvalRuns.get(opts.runId);
        printEnvelope(result, () => renderRun(result));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(runGet, PROMPT_EVAL_RUN_GET_CONTRACT);
  return runGet;
}
