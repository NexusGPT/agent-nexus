import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { color, isJsonMode, printList, printRecord, printSuccess } from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";

export function registerTracingCommands(program: Command): void {
  const tracing = program.command("tracing").description("View LLM traces and analytics");

  // ── traces ────────────────────────────────────────────────────────────
  addPaginationOptions(
    tracing
      .command("traces")
      .description("List LLM traces")
      .option("--status <status>", "Filter by status (IN_PROGRESS, COMPLETED, FAILED)")
      .option("--agent-id <id>", "Filter by agent ID")
      .option("--workflow-id <id>", "Filter by workflow ID")
      .option("--model <name>", "Filter by model name (max 255 chars)")
      .option("--start-date <iso>", "Filter from date (ISO 8601, e.g. 2026-03-01)")
      .option("--end-date <iso>", "Filter to date (ISO 8601, e.g. 2026-03-01)")
      .option(
        "--sort-by <field>",
        "Sort by field (startedAt, totalCostUsd, totalDurationMs)",
        "startedAt"
      )
      .option("--order <dir>", "Sort order (asc, desc)", "desc")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus tracing traces
  $ nexus tracing traces --status FAILED --limit 10
  $ nexus tracing traces --agent-id abc --start-date 2026-03-01 --json`
      )
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
        sortBy: opts.sortBy,
        order: opts.order
      });

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
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
        ]
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── trace (get) ───────────────────────────────────────────────────────
  tracing
    .command("trace")
    .description("Get trace details with generations")
    .argument("<id>", "Trace ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing trace abc-123
  $ nexus tracing trace abc-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const trace = await client.tracing.getTrace(id);
        printRecord(trace as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "status", label: "Status" },
          { key: "agentName", label: "Agent" },
          { key: "workflowName", label: "Workflow" },
          {
            key: "totalCostUsd",
            label: "Cost ($)",
            format: (v) => (v != null ? `$${Number(v).toFixed(4)}` : "-")
          },
          { key: "totalInputTokens", label: "Input Tokens" },
          { key: "totalOutputTokens", label: "Output Tokens" },
          { key: "totalDurationMs", label: "Duration (ms)" },
          { key: "startedAt", label: "Started" },
          { key: "completedAt", label: "Completed" }
        ]);

        // In JSON mode the trace object already carries `generations` nested,
        // so printRecord above emitted them inside the single JSON document.
        // Only render the human-readable generations table for non-JSON output —
        // emitting a second JSON value here would break parsers (NEX-2176).
        const gens = (trace as any).generations;
        if (!isJsonMode() && gens && gens.length > 0) {
          console.log(`\n${color.bold("Generations")} (${gens.length}):\n`);
          printList(gens as Record<string, unknown>[], undefined, [
            { key: "id", label: "ID", width: 36 },
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
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  tracing
    .command("delete")
    .description("Delete a trace and its generations")
    .argument("<id>", "Trace ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing delete abc-123`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.tracing.deleteTrace(id);
        printSuccess("Trace deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── generations ───────────────────────────────────────────────────────
  addPaginationOptions(
    tracing
      .command("generations")
      .description("List LLM generations across traces")
      .option("--trace-id <id>", "Filter by trace ID")
      .option("--provider <provider>", "Filter by provider (OPEN_AI, ANTHROPIC, GOOGLE_AI)")
      .option("--model <name>", "Filter by model name (max 255 chars)")
      .option("--status <status>", "Filter by status (PENDING, RUNNING, COMPLETED, FAILED)")
      .option("--agent-id <id>", "Filter by agent ID")
      .option("--task-id <id>", "Filter by task ID")
      .option("--start-date <iso>", "Filter from date (ISO 8601, e.g. 2026-03-01)")
      .option("--end-date <iso>", "Filter to date (ISO 8601, e.g. 2026-03-01)")
      .option("--min-cost <usd>", "Minimum cost in USD")
      .option("--max-cost <usd>", "Maximum cost in USD")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus tracing generations
  $ nexus tracing generations --provider ANTHROPIC --status FAILED
  $ nexus tracing generations --trace-id abc-123 --json`
      )
  ).action(async (opts) => {
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
        maxCostUsd: opts.maxCost ? parseFloat(opts.maxCost) : undefined
      });

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
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
        ]
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── generation (get) ──────────────────────────────────────────────────
  tracing
    .command("generation")
    .description("Get generation details including prompt and response")
    .argument("<id>", "Generation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing generation gen-123
  $ nexus tracing generation gen-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const gen = await client.tracing.getGeneration(id);
        printRecord(gen as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "traceId", label: "Trace ID" },
          { key: "provider", label: "Provider" },
          { key: "modelName", label: "Model" },
          { key: "status", label: "Status" },
          { key: "inputTokens", label: "Input Tokens" },
          { key: "outputTokens", label: "Output Tokens" },
          {
            key: "costUsd",
            label: "Cost ($)",
            format: (v) => (v != null ? `$${Number(v).toFixed(6)}` : "-")
          },
          { key: "durationMs", label: "Duration (ms)" },
          { key: "temperature", label: "Temperature" },
          { key: "taskName", label: "Task" },
          { key: "startedAt", label: "Started" },
          { key: "completedAt", label: "Completed" },
          { key: "errorMessage", label: "Error" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── models ────────────────────────────────────────────────────────────
  tracing
    .command("models")
    .description("List distinct model names used in traces")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing models`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const models = await client.tracing.listModels();
        const list = Array.isArray(models) ? models : [];

        if (isJsonMode()) {
          console.log(JSON.stringify(list, null, 2));
          return;
        }

        if (list.length === 0) {
          console.log("No models found.");
          return;
        }

        for (const m of list) console.log(m);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── summary ───────────────────────────────────────────────────────────
  tracing
    .command("summary")
    .description("Get tracing analytics summary")
    .option("--start-date <iso>", "Period start (ISO 8601)")
    .option("--end-date <iso>", "Period end (ISO 8601)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing summary
  $ nexus tracing summary --start-date 2026-03-01 --end-date 2026-03-30
  $ nexus tracing summary --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const summary = await client.tracing.getSummary({
          startDate: opts.startDate,
          endDate: opts.endDate
        });
        printRecord(summary as unknown as Record<string, unknown>, [
          { key: "totalTraces", label: "Total Traces" },
          { key: "completedTraces", label: "Completed" },
          { key: "failedTraces", label: "Failed" },
          { key: "inProgressTraces", label: "In Progress" },
          {
            key: "totalCostUsd",
            label: "Total Cost ($)",
            format: (v) => `$${Number(v).toFixed(4)}`
          },
          { key: "totalInputTokens", label: "Input Tokens" },
          { key: "totalOutputTokens", label: "Output Tokens" },
          {
            key: "avgDurationMs",
            label: "Avg Duration",
            format: (v) => (v != null ? `${Number(v).toFixed(0)}ms` : "-")
          },
          { key: "distinctModelCount", label: "Distinct Models" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── cost-breakdown ────────────────────────────────────────────────────
  tracing
    .command("cost-breakdown")
    .description("Get cost breakdown by model, agent, or workflow")
    .option("--group-by <key>", "Group by (model, agent, workflow)", "model")
    .option("--start-date <iso>", "Period start")
    .option("--end-date <iso>", "Period end")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing cost-breakdown
  $ nexus tracing cost-breakdown --group-by agent
  $ nexus tracing cost-breakdown --group-by workflow --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.getCostBreakdown({
          groupBy: opts.groupBy,
          startDate: opts.startDate,
          endDate: opts.endDate
        });
        const entries = (result as any).entries ?? [];
        printList(entries as Record<string, unknown>[], undefined, [
          { key: "groupKey", label: "KEY", width: 36 },
          { key: "groupLabel", label: "LABEL", width: 25 },
          {
            key: "totalCostUsd",
            label: "COST ($)",
            width: 12,
            format: (v) => `$${Number(v).toFixed(4)}`
          },
          { key: "traceCount", label: "TRACES", width: 8 },
          { key: "generationCount", label: "GENS", width: 8 },
          { key: "totalInputTokens", label: "IN TOKENS", width: 12 },
          { key: "totalOutputTokens", label: "OUT TOKENS", width: 12 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── timeline ──────────────────────────────────────────────────────────
  tracing
    .command("timeline")
    .description("Get tracing timeline data")
    .option("--granularity <g>", "Granularity (hour, day, week)", "day")
    .option("--start-date <iso>", "Period start")
    .option("--end-date <iso>", "Period end")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing timeline
  $ nexus tracing timeline --granularity hour --start-date 2026-03-29 --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.getTimeline({
          granularity: opts.granularity,
          startDate: opts.startDate,
          endDate: opts.endDate
        });
        const points = (result as any).points ?? [];
        printList(points as Record<string, unknown>[], undefined, [
          { key: "date", label: "DATE", width: 22 },
          { key: "traceCount", label: "TRACES", width: 8 },
          { key: "generationCount", label: "GENS", width: 8 },
          {
            key: "totalCostUsd",
            label: "COST ($)",
            width: 12,
            format: (v) => `$${Number(v).toFixed(4)}`
          },
          {
            key: "avgDurationMs",
            label: "AVG DUR",
            width: 10,
            format: (v) => (v != null ? `${Number(v).toFixed(0)}ms` : "-")
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── export ────────────────────────────────────────────────────────────
  tracing
    .command("export")
    .description("Export a single trace")
    .argument("<id>", "Trace ID")
    .option("--format <fmt>", "Output format (json, csv)", "json")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing export abc-123
  $ nexus tracing export abc-123 --format csv > trace.csv`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.exportTrace(id, { format: opts.format });
        console.log((result as any).content);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── export-bulk ───────────────────────────────────────────────────────
  tracing
    .command("export-bulk")
    .description("Bulk export traces (max 1000)")
    .option("--format <fmt>", "Output format (json, csv)", "json")
    .option("--status <status>", "Filter by status")
    .option("--agent-id <id>", "Filter by agent ID")
    .option("--workflow-id <id>", "Filter by workflow ID")
    .option("--start-date <iso>", "Filter from date")
    .option("--end-date <iso>", "Filter to date")
    .option("--limit <n>", "Max traces to export", "100")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing export-bulk --format csv > traces.csv
  $ nexus tracing export-bulk --status FAILED --limit 50`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.bulkExport({
          format: opts.format,
          status: opts.status,
          agentId: opts.agentId,
          workflowId: opts.workflowId,
          startDate: opts.startDate,
          endDate: opts.endDate,
          limit: parseInt(opts.limit, 10)
        });
        console.log((result as any).content);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

function formatStatus(v: unknown): string {
  const s = String(v);
  if (s === "COMPLETED") return color.green(s);
  if (s === "FAILED") return color.red(s);
  if (s === "IN_PROGRESS" || s === "RUNNING") return color.yellow(s);
  if (s === "PENDING") return color.dim(s);
  return s;
}
