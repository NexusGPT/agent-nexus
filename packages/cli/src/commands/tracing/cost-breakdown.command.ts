import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope, printList } from "../../output";
import {
  TRACING_ANALYTICS_COST_BREAKDOWN__PARAMS_BUCKET,
  TRACING_ANALYTICS_COST_BREAKDOWN_CONTRACT
} from "../tracing.contract.generated";
import { TRACING_COST_BREAKDOWN_HELP } from "./copy/cost-breakdown-help";

// 🚨 `--bucket` IS A GUARANTEED 400 ON THIS COMMAND'S DEFAULT. The server
// accepts it only when every `groupBy` dimension is an FK dimension
// (deployment, customer, workflowExecution) and `--group-by` defaults to
// `model`. That coupling is DELIBERATELY not re-implemented here: the FK
// subset is nowhere in the contract, so a local check would be a hand-typed
// second copy of a server rule — the exact drift this binding exists to kill.
// The server refuses by name; the Notes say so.

/** `nexus tracing cost-breakdown` — spend grouped by one fixed set of dimensions. */
export function registerTracingCostBreakdownCommand(tracing: Command, program: Command): void {
  const costBreakdown = tracing
    .command("cost-breakdown")
    .description("Get cost breakdown by model, agent, or workflow")
    .option("--group-by <key>", "Group by one key — see Notes; not repeatable", "model")
    .option("--start-date <iso>", "Period start")
    .option("--end-date <iso>", "Period end")
    .addOption(
      enumOption(
        "--bucket <g>",
        "Also split each group into time buckets",
        TRACING_ANALYTICS_COST_BREAKDOWN__PARAMS_BUCKET
      )
    )
    .addHelpText("after", TRACING_COST_BREAKDOWN_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.getCostBreakdown({
          groupBy: opts.groupBy,
          startDate: opts.startDate,
          endDate: opts.endDate,
          bucket: opts.bucket
        });
        const entries = result.entries ?? [];
        // `dimensions` echoes what the breakdown was grouped BY, in order. On a
        // multi-dimension request every row's `groupKey` is a composite
        // `value0|value1`, so without it a consumer cannot say which half is
        // the model and which is the deployment.
        printEnvelope(result, () => {
          printList(entries, undefined, [
            { key: "groupKey", label: "KEY", width: 36 },
            { key: "groupLabel", label: "LABEL", width: 25 },
            // Only when asked for. Unbucketed, every row's `bucket` is null, and a
            // column of dashes reads as missing data rather than as not-requested.
            ...(opts.bucket ? [{ key: "bucket" as const, label: "BUCKET", width: 22 }] : []),
            {
              key: "totalCostUsd",
              label: "COST ($)",
              width: 12,
              format: (v) => `$${Number(v).toFixed(4)}`
            },
            { key: "traceCount", label: "TRACES", width: 8 },
            { key: "generationCount", label: "GENS", width: 8 },
            // A table cannot carry the caveat the summary's single value can, so
            // the Notes above own the sentence and this column owns the number.
            { key: "unpricedGenerationCount", label: "UNPRICED", width: 9 },
            { key: "totalInputTokens", label: "IN TOKENS", width: 12 },
            { key: "totalOutputTokens", label: "OUT TOKENS", width: 12 }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(costBreakdown, TRACING_ANALYTICS_COST_BREAKDOWN_CONTRACT);
}
