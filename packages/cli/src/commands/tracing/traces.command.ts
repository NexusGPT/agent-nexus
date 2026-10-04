import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import {
  TRACING_LIST_TRACES__PARAMS_ORDER,
  TRACING_LIST_TRACES__PARAMS_SORT_BY,
  TRACING_LIST_TRACES__PARAMS_SOURCE,
  TRACING_LIST_TRACES__PARAMS_STATUS,
  TRACING_LIST_TRACES_CONTRACT
} from "../tracing.contract.generated";
import { formatStatus } from "./_shared/format-status";
import { TRACING_TRACES_HELP } from "./copy/traces-help";

//
// `traces` and `cost-breakdown` were the last two absentees, each held back by
// ONE enum with no flag — `source` on traces, `bucket` on cost-breakdown —
// while the gate is all-or-nothing per descriptor. Both flags were added
// rather than deferred, which is the same decision `generations` took.
//
// What that cost on `traces` is the reason to take it: unbound, `--status`,
// `--sort-by` and `--order` hand-typed their values in DESCRIPTIONS and
// validated nothing, and the leaf's own Notes claimed "any other value is
// refused". Driven, `--sort-by __junk__` reached the network. A help text
// asserting a refusal nothing performs is worse than one saying nothing.

/** `nexus tracing traces` — one row per run. */
export function registerTracingTracesCommand(tracing: Command, program: Command): void {
  const traces = addPaginationOptions(
    tracing
      .command("traces")
      .description("List LLM traces")
      .addOption(
        enumOption("--status <status>", "Filter by status", TRACING_LIST_TRACES__PARAMS_STATUS)
      )
      .option("--agent-id <id>", "Filter by agent ID")
      .option("--workflow-id <id>", "Filter by workflow ID")
      .option("--model <name>", "Filter by model name (max 255 chars)")
      .option("--start-date <iso>", "Filter from date (ISO 8601, e.g. 2026-03-01)")
      .option("--end-date <iso>", "Filter to date (ISO 8601, e.g. 2026-03-01)")
      .addOption(
        enumOption(
          "--source <surface>",
          "Filter by the surface that produced the trace",
          TRACING_LIST_TRACES__PARAMS_SOURCE
        )
      )
      .addOption(
        enumOption("--sort-by <field>", "Sort by field", TRACING_LIST_TRACES__PARAMS_SORT_BY)
      )
      .addOption(enumOption("--order <dir>", "Sort order", TRACING_LIST_TRACES__PARAMS_ORDER))
      .addHelpText("after", TRACING_TRACES_HELP)
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.tracing.listTraces({
        ...getPaginationParams(opts),
        status: opts.status,
        agentId: opts.agentId,
        workflowId: opts.workflowId,
        model: opts.model,
        startDate: opts.startDate,
        endDate: opts.endDate,
        source: opts.source,
        sortBy: opts.sortBy,
        order: opts.order
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "status", label: "STATUS", width: 12, format: formatStatus },
        { key: "agentName", label: "AGENT", width: 20 },
        { key: "workflowName", label: "WORKFLOW", width: 20 },
        {
          key: "totalCostUsd",
          label: "COST ($)",
          width: 10,
          format: (v) => (v != null ? `$${Number(v).toFixed(4)}` : "-")
        },
        {
          key: "totalDurationMs",
          label: "DURATION",
          width: 10,
          format: (v) => (v != null ? `${Number(v)}ms` : "-")
        },
        { key: "generationCount", label: "GENS", width: 5 },
        { key: "startedAt", label: "STARTED", width: 20 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // Bound LAST, after every option exists.
  bindCommand(traces, TRACING_LIST_TRACES_CONTRACT);
}
