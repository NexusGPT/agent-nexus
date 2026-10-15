import type { PromptEvalCheckpointSelection } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError, refuse } from "../../../errors";
import { printEnvelope } from "../../../output";
import { PROMPT_EVAL_RUN_PREVIEW_CONTRACT } from "../../eval.contract.generated";
import { collectCheckpoints, repetitionsOutOfRange, splitList } from "./_shared/flag-parsers";
import { buildMatrixPlan, type MatrixFlags, printMatrixPreview } from "./_shared/matrix-plan";

const RUN_PREVIEW_HELP = `
Examples:
  $ nexus eval run preview --conversations conv_a,conv_b --variants Good,Sabotaged --baseline main
  $ nexus eval run preview --conversations conv_a --variants Good --json

Notes:
  THIS COSTS NOTHING and creates nothing. It runs the same validation and
  the same matrix expansion the real creation does, so the case count and
  the warnings it reports are the ones that would actually apply.
  "eval run create --dry-run" is the same call, spelled as a flag.
  IT STILL REFUSES a DRAFT conversation, an unknown variant and a turn that
  is not a checkpoint — which is most of what a dry run is for.`;

/** `nexus eval run preview` */
export function registerEvalRunPreviewCommand(run: Command, program: Command): Command {
  const runPreview = run
    .command("preview")
    .description("Show what a run would be — case count, variants, warnings — creating nothing")
    .requiredOption("--conversations <ids>", "Comma-separated golden conversation ids", splitList)
    .option(
      "--checkpoints <spec>",
      "Narrow one conversation: <conversationId>:<n,..|all>. Repeatable.",
      collectCheckpoints,
      [] as PromptEvalCheckpointSelection[]
    )
    .requiredOption("--variants <names>", "Comma-separated variant refs to compare", splitList)
    .option("--baseline <ref>", 'Comparison base: "main", "none", or a variant ref', "none")
    .option("--judge-model <model>", "Override the judge model (default claude-sonnet-5)")
    .option("--repetitions <n>", "Judge each criterion n times (max 5)", Number.parseInt)
    .addHelpText("after", RUN_PREVIEW_HELP)
    .action(async (opts: MatrixFlags) => {
      try {
        if (repetitionsOutOfRange(opts.repetitions)) {
          process.exitCode = refuse(
            `--repetitions must be between 1 and 5; got ${opts.repetitions}.`
          );
          return;
        }
        const client = createClient(program.optsWithGlobals());
        const preview = await client.promptEvalRuns.preview(buildMatrixPlan(opts));
        printEnvelope(preview, () => printMatrixPreview(preview));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // One contract per leaf: `bindCommand` keys a Map by the command, so a second
  // call on the same leaf silently replaces the first and registers a duplicate
  // `--print-contract`. That is why `preview` is its own leaf rather than only
  // a flag on `create`.
  bindCommand(runPreview, PROMPT_EVAL_RUN_PREVIEW_CONTRACT, {
    "Body.conversationIds": "supplied as the comma-separated --conversations list",
    "Body.checkpoints": "supplied as repeatable --checkpoints <conversationId>:<n,..|all>",
    "Body.variants": "supplied as the comma-separated --variants list",
    "Body.judge.model": "exposed as --judge-model",
    "Body.judge.repetitions": "exposed as --repetitions",
    "Body.judge.provider": "derived from the judge model's catalog entry, never sent by the CLI"
  });
  return runPreview;
}
