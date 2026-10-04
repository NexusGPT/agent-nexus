import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import {
  TRACING_LIST_GENERATIONS__PARAMS_ORDER,
  TRACING_LIST_GENERATIONS__PARAMS_PROVIDER,
  TRACING_LIST_GENERATIONS__PARAMS_SORT_BY,
  TRACING_LIST_GENERATIONS__PARAMS_STATUS,
  TRACING_LIST_GENERATIONS_CONTRACT
} from "../tracing.contract.generated";
import { formatStatus } from "./_shared/format-status";
import { TRACING_GENERATIONS_HELP } from "./copy/generations-help";

/** `nexus tracing generations` — one row per model call, across traces. */
export function registerTracingGenerationsCommand(tracing: Command, program: Command): void {
  const generations = tracing
    .command("generations")
    .description("List LLM generations across traces")
    .option("--trace-id <id>", "Filter by trace ID")
    .addOption(
      enumOption(
        "--provider <provider>",
        "Filter by provider",
        TRACING_LIST_GENERATIONS__PARAMS_PROVIDER
      )
    )
    .option("--model <name>", "Filter by model name (max 255 chars)")
    .addOption(
      enumOption("--status <status>", "Filter by status", TRACING_LIST_GENERATIONS__PARAMS_STATUS)
    )
    .option("--agent-id <id>", "Filter by agent ID")
    .option("--task-id <id>", "Filter by task ID")
    .option("--start-date <iso>", "Filter from date (ISO 8601, e.g. 2026-03-01)")
    .option("--end-date <iso>", "Filter to date (ISO 8601, e.g. 2026-03-01)")
    .option("--min-cost <usd>", "Minimum cost in USD")
    .option("--max-cost <usd>", "Maximum cost in USD")
    .addOption(
      enumOption(
        "--sort-by <field>",
        "Sort by field",
        TRACING_LIST_GENERATIONS__PARAMS_SORT_BY
      ).default("startedAt")
    )
    .addOption(
      enumOption("--order <dir>", "Sort order", TRACING_LIST_GENERATIONS__PARAMS_ORDER).default(
        "desc"
      )
    )
    .addHelpText("after", TRACING_GENERATIONS_HELP);
  addPaginationOptions(generations).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.tracing.listGenerations({
        ...getPaginationParams(opts),
        traceId: opts.traceId,
        provider: opts.provider,
        modelName: opts.model,
        status: opts.status,
        agentId: opts.agentId,
        taskId: opts.taskId,
        startDate: opts.startDate,
        endDate: opts.endDate,
        minCostUsd: opts.minCost ? parseFloat(opts.minCost) : undefined,
        maxCostUsd: opts.maxCost ? parseFloat(opts.maxCost) : undefined,
        sortBy: opts.sortBy,
        order: opts.order
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "traceId", label: "TRACE", width: 36 },
        { key: "modelName", label: "MODEL", width: 25 },
        { key: "status", label: "STATUS", width: 12, format: formatStatus },
        {
          key: "costUsd",
          label: "COST ($)",
          width: 10,
          format: (v) => (v != null ? `$${Number(v).toFixed(6)}` : "-")
        },
        {
          key: "durationMs",
          label: "DURATION",
          width: 10,
          format: (v) => (v != null ? `${v}ms` : "-")
        }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // Bound LAST, after every option exists.
  bindCommand(generations, TRACING_LIST_GENERATIONS_CONTRACT);
}
