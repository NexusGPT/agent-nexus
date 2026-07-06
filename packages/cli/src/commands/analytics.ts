import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { isJsonMode, printList, printRecord } from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { parseTimePeriod, TIME_PERIOD_HELP } from "../util/time-period";

// Curated analytics views. Keep in lockstep with `ANALYTICS_VIEW_NAMES` in
// @nexus/types (packages/types/src/api/public/v1/schemas/analytics-catalog.ts,
// the source of truth) — the CLI ships standalone, so it can't import it. The
// `query` (raw-SQL) footer uses the physical `analytics_<name>` view; the
// `metrics` (structured) footer uses the public `<name>`. Both derive from this
// one list so they can never disagree.
const ANALYTICS_VIEWS = [
  "generations",
  "traces",
  "conversations",
  "messages",
  "executions",
  "node_runs",
  "scores",
  "score_events"
] as const;

const ANALYTICS_PUBLIC_VIEWS = ANALYTICS_VIEWS.join(", ");
const ANALYTICS_PHYSICAL_VIEWS = ANALYTICS_VIEWS.map((v) => `analytics_${v}`).join(", ");

export function registerAnalyticsCommands(program: Command): void {
  const analytics = program.command("analytics").description("View analytics and metrics");

  // ── overview ──────────────────────────────────────────────────────────
  analytics
    .command("overview")
    .description("Get analytics overview")
    .option("--time-period <period>", TIME_PERIOD_HELP, parseTimePeriod)
    .option("--deployment-id <id>", "Filter by deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics overview
  $ nexus analytics overview --time-period 30d
  $ nexus analytics overview --deployment-id dep-123 --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.analytics.getOverview({
          timePeriod: opts.timePeriod,
          deploymentId: opts.deploymentId
        });
        printRecord(result as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── feedback ──────────────────────────────────────────────────────────
  addPaginationOptions(
    analytics
      .command("feedback")
      .description("List satisfaction feedback")
      .option("--time-period <period>", TIME_PERIOD_HELP, parseTimePeriod)
      .option("--deployment-id <id>", "Filter by deployment")
      .option("--score <number>", "Filter by score", parseInt)
      .addHelpText(
        "after",
        `
Examples:
  $ nexus analytics feedback
  $ nexus analytics feedback --time-period 7d --score 5
  $ nexus analytics feedback --limit 20 --json`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const result = await client.analytics.listFeedback({
        ...getPaginationParams(opts),
        timePeriod: opts.timePeriod,
        deploymentId: opts.deploymentId,
        score: opts.score
      });

      const data = (result as any).data ?? [];
      const meta = (result as any).meta;

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "score", label: "SCORE", width: 6 },
        { key: "comment", label: "COMMENT", width: 40 },
        { key: "createdAt", label: "DATE", width: 20 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── export ────────────────────────────────────────────────────────────
  analytics
    .command("export")
    .description("Export analytics as CSV")
    .option("--time-period <period>", TIME_PERIOD_HELP, parseTimePeriod)
    .option("--deployment-id <id>", "Filter by deployment")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics export
  $ nexus analytics export --time-period 30d > analytics.csv
  $ nexus analytics export --deployment-id dep-123

Notes:
  Outputs CSV to stdout. Redirect to file: nexus analytics export > report.csv`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.analytics.exportCsv({
          timePeriod: opts.timePeriod,
          deploymentId: opts.deploymentId
        });

        // CSV data — output directly for piping
        if (typeof result === "string") {
          console.log(result);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── query ─────────────────────────────────────────────────────────────
  analytics
    .command("query <sql>")
    .description("Run a read-only SQL query over the curated analytics views")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics query 'SELECT count(*) AS n FROM analytics_traces'
  $ nexus analytics query 'SELECT "modelName", SUM("costUsd") AS spend FROM analytics_generations GROUP BY 1 ORDER BY spend DESC' --json

Notes:
  Read-only, single statement, org-scoped. Views: ${ANALYTICS_PHYSICAL_VIEWS}.`
    )
    .action(async (sql: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.analytics.query({ query: sql });

        if (result.error) {
          process.stderr.write(`query error: ${result.error}\n`);
          process.exitCode = 1;
          return;
        }

        const columns = result.fields.map((f) => ({ key: f.name, label: f.name, width: 28 }));
        printList(result.rows, undefined, columns);

        if (!isJsonMode()) {
          const note = result.truncated ? " (truncated)" : "";
          process.stderr.write(
            `\n${result.rowCount} row(s) in ${result.executionTimeMs}ms${note}\n`
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── metrics (structured, non-SQL) ─────────────────────────────────────────
  analytics
    .command("metrics <view>")
    .description("Run a structured (non-SQL) query over a curated analytics view")
    .option("-m, --metric <metric...>", 'metric(s): "count" or "<agg>:<column>" (sum|avg|min|max)')
    .option("-g, --group-by <dimension...>", "dimension(s) to group by")
    .option(
      "-f, --filter <expr...>",
      'filter(s) as "field:op:value" (op = eq|neq|in|gt|gte|lt|lte)'
    )
    .option("--granularity <granularity>", "time bucket: hour | day | week | month")
    .option("-p, --period <period>", "time period (default last_30_days)")
    .option("--order-by <alias>", "metric alias, groupBy field, or 'bucket'")
    .option("--order <order>", "asc | desc")
    .option("--limit <n>", "max rows", (v) => parseInt(v, 10))
    .option("--show-sql", "print the generated SQL to stderr")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics metrics conversations -m count -g agentId --period last_7_days
  $ nexus analytics metrics node_runs -m count -g nodeType -f status:eq:ERROR --json
  $ nexus analytics metrics generations -m sum:costUsd -g modelName --granularity day --order-by bucket

Views: ${ANALYTICS_PUBLIC_VIEWS}.`
    )
    .action(
      async (
        view: string,
        opts: {
          metric?: string[];
          groupBy?: string[];
          filter?: string[];
          granularity?: string;
          period?: string;
          orderBy?: string;
          order?: string;
          limit?: number;
          showSql?: boolean;
        }
      ) => {
        try {
          const filters = (opts.filter ?? []).map((raw) => {
            const idx1 = raw.indexOf(":");
            const idx2 = raw.indexOf(":", idx1 + 1);
            if (idx1 === -1 || idx2 === -1) {
              throw new Error(`Invalid filter "${raw}". Use "field:op:value".`);
            }
            const op = raw.slice(idx1 + 1, idx2);
            const rawValue = raw.slice(idx2 + 1);
            return {
              field: raw.slice(0, idx1),
              op,
              value: op === "in" ? rawValue.split(",") : rawValue
            } as {
              field: string;
              op: "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte";
              value: string | string[];
            };
          });

          const client = createClient(program.optsWithGlobals());
          const result = await client.analytics.queryStructured({
            view,
            metrics: opts.metric ?? ["count"],
            groupBy: opts.groupBy,
            filters,
            granularity: opts.granularity as "hour" | "day" | "week" | "month" | undefined,
            period: opts.period,
            orderBy: opts.orderBy,
            order: opts.order as "asc" | "desc" | undefined,
            limit: opts.limit
          });

          if (result.error) {
            process.stderr.write(`query error: ${result.error}\n`);
            process.exitCode = 1;
            return;
          }

          if (opts.showSql) process.stderr.write(`SQL: ${result.generatedSql}\n`);

          const columns = result.fields.map((f) => ({ key: f.name, label: f.name, width: 28 }));
          printList(result.rows, undefined, columns);

          if (!isJsonMode()) {
            const note = result.truncated ? " (truncated)" : "";
            process.stderr.write(
              `\n${result.rowCount} row(s) in ${result.executionTimeMs}ms${note}\n`
            );
          }
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
}
