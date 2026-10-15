import type { PromptEvalCheckpointSelection } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError, refuse } from "../../../errors";
import { color, printEnvelope } from "../../../output";
import { PROMPT_EVAL_RUN_CREATE_CONTRACT } from "../../eval.contract.generated";
import {
  collectCheckpoints,
  repetitionsOutOfRange,
  splitList,
  toUsdTenThousandths
} from "./_shared/flag-parsers";
import { buildMatrixPlan, type MatrixFlags, printMatrixPreview } from "./_shared/matrix-plan";

const RUN_CREATE_HELP = `
Examples:
  $ nexus eval run create --conversations conv_a,conv_b --variants Good,Sabotaged --baseline main
  $ nexus eval run create --conversations conv_a --checkpoints conv_a:1,3 \\
      --variants Good --baseline none --budget-cap-usd 0.50 --json
  $ nexus eval run create --conversations conv_a,conv_b --variants a,b,c --dry-run

Notes:
  🔴 THIS RUNS THE AGENT LIVE AND SPENDS REAL MONEY. Each cell is one agent
  turn with real tool calls plus at least one judge call, four at a time.
  --dry-run answers with the case count and creates nothing.
  --budget-cap-usd bounds it: the run stops and reports abortReason
  BUDGET_CAP once accrued cost reaches the cap.
  EVERY CONVERSATION MUST BE READY and belong to the same agent.
  --checkpoints DEFAULTS TO ALL: a conversation you do not narrow contributes
  every checkpoint it carries. "<conv>:all" says that explicitly.
  --baseline ADDS A COLUMN and is what makes the delta column appear;
  "none" (the default) means no deltas anywhere in the results.
  CREATE RETURNS IMMEDIATELY with the run QUEUED — poll "eval run get".`;

interface CreateFlags extends MatrixFlags {
  name?: string;
  budgetCapUsd?: string;
  dryRun?: boolean;
}

/**
 * ⚠️ `--dry-run` RETURNS BEFORE `--budget-cap-usd` IS PARSED, so a malformed cap
 * is silently ignored on a dry run and refused on a real one. Pre-existing and
 * preserved verbatim — the order of these two blocks IS the behaviour.
 */
async function createEvalRun(program: Command, opts: CreateFlags): Promise<void> {
  try {
    if (repetitionsOutOfRange(opts.repetitions)) {
      process.exitCode = refuse(`--repetitions must be between 1 and 5; got ${opts.repetitions}.`);
      return;
    }
    const plan = buildMatrixPlan(opts);
    const client = createClient(program.optsWithGlobals());

    if (opts.dryRun === true) {
      const preview = await client.promptEvalRuns.preview(plan);
      printEnvelope(preview, () => printMatrixPreview(preview));
      return;
    }

    let budgetCapUsdTenThousandths: number | undefined;
    if (opts.budgetCapUsd !== undefined) {
      const cap = toUsdTenThousandths(opts.budgetCapUsd);
      if (cap === null) {
        process.exitCode = refuse(
          `--budget-cap-usd must be a positive amount; got "${opts.budgetCapUsd}"`
        );
        return;
      }
      budgetCapUsdTenThousandths = cap;
    }

    const result = await client.promptEvalRuns.create({
      ...plan,
      ...(opts.name !== undefined ? { name: opts.name } : {}),
      ...(budgetCapUsdTenThousandths !== undefined ? { budgetCapUsdTenThousandths } : {})
    });
    // The run id is the payload under --json, so a script can pipe it
    // straight into `run get` the way every other create verb allows.
    printEnvelope(result.run, () => {
      for (const warning of result.warnings) console.log(color.yellow(warning));
      console.log(`Queued eval run ${color.bold(result.run.id)} (${result.run.status})`);
      console.log(color.dim(`Poll it: nexus eval run get --run-id ${result.run.id}`));
    });
  } catch (err) {
    process.exitCode = handleError(err);
  }
}

/** `nexus eval run create` */
export function registerEvalRunCreateCommand(run: Command, program: Command): Command {
  const runCreate = run
    .command("create")
    .description("Queue an eval run: variants x checkpoints, judged against the goldens")
    .requiredOption("--conversations <ids>", "Comma-separated golden conversation ids", splitList)
    .option(
      "--checkpoints <spec>",
      "Narrow one conversation: <conversationId>:<n,..|all>. Repeatable.",
      collectCheckpoints,
      [] as PromptEvalCheckpointSelection[]
    )
    .requiredOption("--variants <names>", "Comma-separated variant refs to compare", splitList)
    .option("--baseline <ref>", 'Comparison base: "main", "none", or a variant ref', "none")
    .option("--name <name>", "A name for this run")
    .option("--budget-cap-usd <usd>", "Abort the run once it has spent this much")
    .option("--judge-model <model>", "Override the judge model (default claude-sonnet-5)")
    .option("--repetitions <n>", "Judge each criterion n times (max 5)", Number.parseInt)
    .option("--dry-run", "Show what the run would be, and create nothing")
    .addHelpText("after", RUN_CREATE_HELP)
    .action(async (opts: CreateFlags) => createEvalRun(program, opts));

  // Bound last, so generated reference text lands after the hand-written Notes.
  bindCommand(runCreate, PROMPT_EVAL_RUN_CREATE_CONTRACT, {
    "Body.conversationIds": "supplied as the comma-separated --conversations list",
    "Body.checkpoints": "supplied as repeatable --checkpoints <conversationId>:<n,..|all>",
    "Body.variants": "supplied as the comma-separated --variants list",
    "Body.judge.model": "exposed as --judge-model",
    "Body.judge.repetitions": "exposed as --repetitions",
    "Body.judge.provider": "derived from the judge model's catalog entry, never sent by the CLI",
    "Body.budgetCapUsdTenThousandths": "exposed as --budget-cap-usd, in dollars"
  });
  return runCreate;
}
