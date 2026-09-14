import { type Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError, refuse } from "../errors";
import { color, printEnvelope, printTable } from "../output";
import { confirmable, confirmDestructive } from "../util/confirm";
import { firstNonBlankOr } from "../util/present-text";
import {
  PROMPT_EVAL_RUN_ABORT_CONTRACT,
  PROMPT_EVAL_RUN_CREATE_CONTRACT,
  PROMPT_EVAL_RUN_GET_CONTRACT,
  PROMPT_EVAL_RUN_LIST_CONTRACT,
  PROMPT_EVAL_RUN_PREVIEW_CONTRACT,
  PROMPT_EVAL_RUN_RESULTS_CONTRACT
} from "./eval.contract.generated";
import { renderCaseDetail, renderResultsMatrix, renderRun } from "./eval-run-render";

/** `--conversations a,b` and `--variants "A","B"` are comma-separated lists. */
function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/**
 * `--checkpoints <conv>:<n,..|all>`, repeatable. `all` is expressed by OMITTING
 * the conversation from the parsed list — the server already means "every
 * checkpoint" for a conversation nobody narrowed, so sending an explicit list
 * of all of them would be a second way to say the same thing that goes stale
 * the moment a checkpoint is added.
 */
function collectCheckpoints(
  raw: string,
  previous: Array<{ conversationId: string; turnIndexes: number[] }>
): Array<{ conversationId: string; turnIndexes: number[] }> {
  const separator = raw.lastIndexOf(":");
  if (separator <= 0) {
    refuse(`--checkpoints must be <conversationId>:<n,..|all>; got "${raw}"`);
    return previous;
  }
  const conversationId = raw.slice(0, separator);
  const spec = raw.slice(separator + 1).trim();
  if (spec === "all") return previous;

  const turnIndexes = splitList(spec).map((n) => Number.parseInt(n, 10));
  if (turnIndexes.some((n) => Number.isNaN(n) || n < 0)) {
    refuse(`--checkpoints turn indexes must be non-negative integers; got "${spec}"`);
    return previous;
  }
  return [...previous, { conversationId, turnIndexes }];
}

/** USD on the flag, ten-thousandths on the wire. `0.0001` is the smallest cap. */
function toUsdTenThousandths(raw: string): number | null {
  const usd = Number.parseFloat(raw);
  if (Number.isNaN(usd) || usd <= 0) return null;
  return Math.max(1, Math.round(usd * 10_000));
}

/**
 * `nexus eval run` — the matrix (Prompt Lab phase 3).
 *
 * ## 🔴 `run create` SPENDS REAL MONEY
 *
 * Every cell of the matrix runs the agent live — its tools execute for real —
 * and then calls a judge. A run is variants x checkpoints x conversations, so
 * the cost multiplies fast. `--dry-run` shows the case count before you commit,
 * and `--budget-cap-usd` stops the run once it reaches a ceiling.
 *
 * ## The loop
 *
 * `create` queues and returns immediately; poll `get` until the status leaves
 * QUEUED/RUNNING; `results` renders the matrix; `get --case` opens one cell.
 */
export function registerEvalRunCommands(evalCmd: Command, program: Command): void {
  const run = evalCmd.command("run").description("Run and read prompt evaluations");

  // ── run create ────────────────────────────────────────────────────────────
  const runCreate = run
    .command("create")
    .description("Queue an eval run: variants x checkpoints, judged against the goldens")
    .requiredOption("--conversations <ids>", "Comma-separated golden conversation ids", splitList)
    .option(
      "--checkpoints <spec>",
      "Narrow one conversation: <conversationId>:<n,..|all>. Repeatable.",
      collectCheckpoints,
      [] as Array<{ conversationId: string; turnIndexes: number[] }>
    )
    .requiredOption("--variants <names>", "Comma-separated variant refs to compare", splitList)
    .option("--baseline <ref>", 'Comparison base: "main", "none", or a variant ref', "none")
    .option("--name <name>", "A name for this run")
    .option("--budget-cap-usd <usd>", "Abort the run once it has spent this much")
    .option("--judge-model <model>", "Override the judge model (default claude-sonnet-5)")
    .option("--repetitions <n>", "Judge each criterion n times (max 5)", Number.parseInt)
    .option("--dry-run", "Show what the run would be, and create nothing")
    .addHelpText(
      "after",
      `
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
  CREATE RETURNS IMMEDIATELY with the run QUEUED — poll "eval run get".`
    )
    .action(
      async (opts: {
        conversations: string[];
        checkpoints: Array<{ conversationId: string; turnIndexes: number[] }>;
        variants: string[];
        baseline: string;
        name?: string;
        budgetCapUsd?: string;
        judgeModel?: string;
        repetitions?: number;
        dryRun?: boolean;
      }) => {
        try {
          if (opts.repetitions !== undefined && (opts.repetitions < 1 || opts.repetitions > 5)) {
            refuse(`--repetitions must be between 1 and 5; got ${opts.repetitions}.`);
            return;
          }
          const judge = {
            ...(opts.judgeModel !== undefined ? { model: opts.judgeModel } : {}),
            ...(opts.repetitions !== undefined ? { repetitions: opts.repetitions } : {})
          };
          const plan = {
            conversationIds: opts.conversations,
            ...(opts.checkpoints.length > 0 ? { checkpoints: opts.checkpoints } : {}),
            variants: opts.variants,
            baseline: opts.baseline,
            ...(Object.keys(judge).length > 0 ? { judge } : {})
          };

          const client = createClient(program.optsWithGlobals());

          if (opts.dryRun === true) {
            const preview = await client.promptEvalRuns.preview(plan);
            printEnvelope(preview, () => {
              console.log(
                `${preview.caseCount} cases: ${preview.candidates.length} variants x ` +
                  `${preview.selection.reduce((n, s) => n + s.turnIndexes.length, 0)} checkpoints`
              );
              for (const warning of preview.warnings) console.log(color.yellow(warning));
              console.log(color.dim("Nothing was created."));
            });
            return;
          }

          let budgetCapUsdTenThousandths: number | undefined;
          if (opts.budgetCapUsd !== undefined) {
            const cap = toUsdTenThousandths(opts.budgetCapUsd);
            if (cap === null) {
              refuse(`--budget-cap-usd must be a positive amount; got "${opts.budgetCapUsd}"`);
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
    );

  // ── run preview ───────────────────────────────────────────────────────────
  const runPreview = run
    .command("preview")
    .description("Show what a run would be — case count, variants, warnings — creating nothing")
    .requiredOption("--conversations <ids>", "Comma-separated golden conversation ids", splitList)
    .option(
      "--checkpoints <spec>",
      "Narrow one conversation: <conversationId>:<n,..|all>. Repeatable.",
      collectCheckpoints,
      [] as Array<{ conversationId: string; turnIndexes: number[] }>
    )
    .requiredOption("--variants <names>", "Comma-separated variant refs to compare", splitList)
    .option("--baseline <ref>", 'Comparison base: "main", "none", or a variant ref', "none")
    .option("--judge-model <model>", "Override the judge model (default claude-sonnet-5)")
    .option("--repetitions <n>", "Judge each criterion n times (max 5)", Number.parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval run preview --conversations conv_a,conv_b --variants Good,Sabotaged --baseline main
  $ nexus eval run preview --conversations conv_a --variants Good --json

Notes:
  THIS COSTS NOTHING and creates nothing. It runs the same validation and
  the same matrix expansion the real creation does, so the case count and
  the warnings it reports are the ones that would actually apply.
  "eval run create --dry-run" is the same call, spelled as a flag.
  IT STILL REFUSES a DRAFT conversation, an unknown variant and a turn that
  is not a checkpoint — which is most of what a dry run is for.`
    )
    .action(
      async (opts: {
        conversations: string[];
        checkpoints: Array<{ conversationId: string; turnIndexes: number[] }>;
        variants: string[];
        baseline: string;
        judgeModel?: string;
        repetitions?: number;
      }) => {
        try {
          if (opts.repetitions !== undefined && (opts.repetitions < 1 || opts.repetitions > 5)) {
            refuse(`--repetitions must be between 1 and 5; got ${opts.repetitions}.`);
            return;
          }
          const judge = {
            ...(opts.judgeModel !== undefined ? { model: opts.judgeModel } : {}),
            ...(opts.repetitions !== undefined ? { repetitions: opts.repetitions } : {})
          };
          const client = createClient(program.optsWithGlobals());
          const preview = await client.promptEvalRuns.preview({
            conversationIds: opts.conversations,
            ...(opts.checkpoints.length > 0 ? { checkpoints: opts.checkpoints } : {}),
            variants: opts.variants,
            baseline: opts.baseline,
            ...(Object.keys(judge).length > 0 ? { judge } : {})
          });
          printEnvelope(preview, () => {
            console.log(
              `${preview.caseCount} cases: ${preview.candidates.length} variants x ` +
                `${preview.selection.reduce((n, s) => n + s.turnIndexes.length, 0)} checkpoints`
            );
            for (const warning of preview.warnings) console.log(color.yellow(warning));
            console.log(color.dim("Nothing was created."));
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── run list ──────────────────────────────────────────────────────────────
  const runList = run
    .command("list")
    .description("List eval runs, newest first")
    .option("--agent-id <id>", "Only this agent's runs")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval run list
  $ nexus eval run list --agent-id 11111111-1111-4111-8111-111111111111 --json

Notes:
  Under --json the payload is a BARE ARRAY of runs.`
    )
    .action(async (opts: { agentId?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptEvalRuns.list({
          ...(opts.agentId !== undefined ? { agentId: opts.agentId } : {})
        });
        printEnvelope(result, () => {
          printTable(
            result.map((one) => ({
              name: firstNonBlankOr([one.name], "(unnamed)"),
              status: one.status,
              variants: one.candidates.map((c) => c.variantName).join(","),
              cost: `$${(one.cost.totalUsdTenThousandths / 10_000).toFixed(4)}`,
              id: one.id
            })),
            [
              { key: "name", label: "NAME", width: 22 },
              { key: "status", label: "STATUS", width: 10 },
              { key: "variants", label: "VARIANTS", width: 24 },
              { key: "cost", label: "COST", width: 10 },
              { key: "id", label: "ID", width: 36 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── run get ───────────────────────────────────────────────────────────────
  const runGet = run
    .command("get")
    .description("Show a run's status and rollup, or one case with --case")
    .requiredOption("--run-id <id>", "Eval run id")
    .option("--case <caseId>", "Show this cell: golden vs candidate, with judge reasoning")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval run get --run-id 77777777-7777-4777-8777-777777777777
  $ nexus eval run get --run-id 77777777-7777-4777-8777-777777777777 --json
  $ nexus eval run get --run-id 77777777-7777-4777-8777-777777777777 --case 88888888-8888-4888-8888-888888888888

Notes:
  .rollup IS NULL UNTIL THE RUN SETTLES — poll .status and stop when it is
  no longer QUEUED or RUNNING.
  --case takes an id from "eval run results --json" (.cases[].id) and shows
  the golden reply, the candidate reply, both sides' tool calls, and the
  judge's reasoning per criterion.
  .cost is in ten-thousandths of a USD: 1500 means $0.15.`
    )
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

  // ── run abort ─────────────────────────────────────────────────────────────
  const runAbort = confirmable(
    run.command("abort").description("Stop a queued or running eval run")
  )
    .requiredOption("--run-id <id>", "Eval run id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval run abort --run-id 77777777-7777-4777-8777-777777777777 --yes

Notes:
  CELLS ALREADY IN FLIGHT FINISH AND ARE KEPT. Cells that never started
  become SKIPPED, and the partial matrix keeps its scores and its cost —
  nothing already paid for is discarded.
  An aborted run stays ABORTED; the executor never overwrites it.
  Without --yes this asks at a terminal and REFUSES in a script.`
    )
    .action(async (opts: { runId: string; yes?: boolean }) => {
      try {
        if (!(await confirmDestructive(`Abort eval run ${opts.runId}?`, opts))) return;
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptEvalRuns.abort(opts.runId);
        printEnvelope(result, () => {
          console.log(`Aborted ${result.id} (${result.abortReason ?? "USER_REQUESTED"})`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── run results ───────────────────────────────────────────────────────────
  const runResults = run
    .command("results")
    .description("The matrix: checkpoints x variants, with the per-variant rollup")
    .requiredOption("--run-id <id>", "Eval run id")
    .addHelpText(
      "after",
      `
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
  a case id for "eval run get --case" comes from.`
    )
    .action(async (opts: { runId: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptEvalRuns.results(opts.runId);
        printEnvelope(result, () => renderResultsMatrix(result));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound last, so generated reference text lands after the hand-written Notes.
  // One contract per leaf: `bindCommand` keys a Map by the command, so a second
  // call on the same leaf silently replaces the first and registers a duplicate
  // `--print-contract`. That is why `preview` is its own leaf rather than only
  // a flag on `create`.
  bindCommand(runCreate, PROMPT_EVAL_RUN_CREATE_CONTRACT, {
    "Body.conversationIds": "supplied as the comma-separated --conversations list",
    "Body.checkpoints": "supplied as repeatable --checkpoints <conversationId>:<n,..|all>",
    "Body.variants": "supplied as the comma-separated --variants list",
    "Body.judge.model": "exposed as --judge-model",
    "Body.judge.repetitions": "exposed as --repetitions",
    "Body.judge.provider": "derived from the judge model's catalog entry, never sent by the CLI",
    "Body.budgetCapUsdTenThousandths": "exposed as --budget-cap-usd, in dollars"
  });
  bindCommand(runPreview, PROMPT_EVAL_RUN_PREVIEW_CONTRACT, {
    "Body.conversationIds": "supplied as the comma-separated --conversations list",
    "Body.checkpoints": "supplied as repeatable --checkpoints <conversationId>:<n,..|all>",
    "Body.variants": "supplied as the comma-separated --variants list",
    "Body.judge.model": "exposed as --judge-model",
    "Body.judge.repetitions": "exposed as --repetitions",
    "Body.judge.provider": "derived from the judge model's catalog entry, never sent by the CLI"
  });
  bindCommand(runList, PROMPT_EVAL_RUN_LIST_CONTRACT);
  bindCommand(runGet, PROMPT_EVAL_RUN_GET_CONTRACT);
  bindCommand(runAbort, PROMPT_EVAL_RUN_ABORT_CONTRACT);
  bindCommand(runResults, PROMPT_EVAL_RUN_RESULTS_CONTRACT);
}
