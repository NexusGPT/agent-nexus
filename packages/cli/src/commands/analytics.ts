import { Command, Option } from "commander";

import { createClient } from "../client";
import {
  bindCommand,
  type ContractEnum,
  enumArgument,
  enumInCompositeOption,
  enumOption
} from "../contract-binding";
import { handleError } from "../errors";
import { isJsonMode, printList, printRecord } from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { parseTimePeriod, TIME_PERIOD_HELP, TIME_PERIOD_SHORTHANDS } from "../util/time-period";
import {
  ANALYTICS_EXPORT__PARAMS_TIME_PERIOD,
  ANALYTICS_EXPORT_CONTRACT,
  ANALYTICS_FEEDBACK__PARAMS_TIME_PERIOD,
  ANALYTICS_FEEDBACK_CONTRACT,
  ANALYTICS_OVERVIEW__PARAMS_TIME_PERIOD,
  ANALYTICS_OVERVIEW_CONTRACT,
  ANALYTICS_QUERY_CONTRACT,
  ANALYTICS_QUERY_STRUCTURED__BODY_FILTERS_ITEM_OP,
  ANALYTICS_QUERY_STRUCTURED__BODY_GRANULARITY,
  ANALYTICS_QUERY_STRUCTURED__BODY_ORDER,
  ANALYTICS_QUERY_STRUCTURED__BODY_PERIOD,
  ANALYTICS_QUERY_STRUCTURED__BODY_VIEW,
  ANALYTICS_QUERY_STRUCTURED_CONTRACT
} from "./analytics.contract.generated";

/**
 * The curated views, from the contract rather than retyped.
 *
 * This list used to be eight string literals with a comment asking whoever
 * edited `ANALYTICS_VIEW_NAMES` to remember this file — "the CLI ships
 * standalone, so it can't import it". It can't import it at RUNTIME; it can
 * generate from it at build time, which is what
 * `analytics.contract.generated.ts` is. `contract-help.test.ts` fails if the
 * generated copy stops matching the schema.
 *
 * `query` (raw SQL) addresses the PHYSICAL view, `metrics` (structured) the
 * public one, and both derive from this single array so they cannot disagree
 * about which views exist.
 */
const ANALYTICS_PUBLIC_VIEWS = ANALYTICS_QUERY_STRUCTURED__BODY_VIEW.contractValues.join(", ");
const ANALYTICS_PHYSICAL_VIEWS = ANALYTICS_QUERY_STRUCTURED__BODY_VIEW.contractValues
  .map((view) => `analytics_${view}`)
  .join(", ");

/**
 * `--time-period`, bound to whichever descriptor's copy of the enum applies.
 *
 * The CLI accepts MORE than the contract here and always has: `30d` and friends
 * were the documented spelling in older help text, and NEX-2367 kept them
 * working rather than 400ing a command somebody had in a script. That is a
 * declared WIDENING — the shorthands are offered as choices and normalised to
 * the canonical value before the request leaves, so the flag is still validated
 * locally and the server still only ever sees an enum member.
 */
function timePeriodOption(source: ContractEnum): Option {
  return enumOption(
    "--time-period <period>",
    TIME_PERIOD_HELP,
    source,
    {
      alsoAccepts: TIME_PERIOD_SHORTHANDS,
      because: "shorthands are normalised to the canonical value before sending"
    },
    parseTimePeriod
  );
}

export function registerAnalyticsCommands(program: Command): void {
  const analytics = program.command("analytics").description("View analytics and metrics");

  // ── overview ──────────────────────────────────────────────────────────
  const overview = analytics
    .command("overview")
    .description("Get analytics overview")
    .addOption(timePeriodOption(ANALYTICS_OVERVIEW__PARAMS_TIME_PERIOD))
    .option("--deployment-id <id>", "Filter by deployment ID");

  overview
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics overview
  $ nexus analytics overview --time-period last_30_days
  $ nexus analytics overview --deployment-id dep-123 --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.analytics.getOverview({
          timePeriod: opts.timePeriod,
          deploymentId: opts.deploymentId
        });
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── feedback ──────────────────────────────────────────────────────────
  const feedback = addPaginationOptions(
    analytics
      .command("feedback")
      .description("List satisfaction feedback")
      .addOption(timePeriodOption(ANALYTICS_FEEDBACK__PARAMS_TIME_PERIOD))
      .option("--deployment-id <id>", "Filter by deployment")
      .option("--score <number>", "Filter by score", parseInt)
      .option("--search <keyword>", "Filter by keyword in the feedback comment")
  );

  feedback
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics feedback
  $ nexus analytics feedback --time-period 7d --score 5
  $ nexus analytics feedback --search "too long"
  $ nexus analytics feedback --limit 20 --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.analytics.listFeedback({
          ...getPaginationParams(opts),
          timePeriod: opts.timePeriod,
          deploymentId: opts.deploymentId,
          score: opts.score,
          search: opts.search
        });

        const data = result.data ?? [];
        const meta = result.meta;

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
  const exportCsv = analytics
    .command("export")
    .description("Export analytics as CSV")
    .addOption(timePeriodOption(ANALYTICS_EXPORT__PARAMS_TIME_PERIOD))
    .option("--deployment-id <id>", "Filter by deployment");

  exportCsv
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
  const query = analytics
    .command("query <sql>")
    .description("Run a read-only SQL query over the curated analytics views");

  query
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
  // `<view>` IS validated, exactly like the flags beside it. Commander checks
  // `.choices()` on a positional as readily as on an option — measured by
  // driving a junk value through a real program, not by reading `Argument`.
  const metrics = analytics
    .command("metrics")
    .description("Run a structured (non-SQL) query over a curated analytics view")
    .addArgument(
      enumArgument(
        "<view>",
        "Curated analytics view to query",
        ANALYTICS_QUERY_STRUCTURED__BODY_VIEW
      )
    )
    .option("-m, --metric <metric...>", 'metric(s): "count" or "<agg>:<column>" (sum|avg|min|max)')
    .option("-g, --group-by <dimension...>", "dimension(s) to group by")
    .addOption(
      enumInCompositeOption(
        "-f, --filter <expr...>",
        'filter(s) as "field:op:value"',
        ANALYTICS_QUERY_STRUCTURED__BODY_FILTERS_ITEM_OP,
        "op"
      )
    )
    .addOption(
      enumOption(
        "--granularity <granularity>",
        "time bucket",
        ANALYTICS_QUERY_STRUCTURED__BODY_GRANULARITY
      )
    )
    .addOption(
      enumOption(
        "-p, --period <period>",
        "time period (default last_30_days)",
        ANALYTICS_QUERY_STRUCTURED__BODY_PERIOD
      )
    )
    .option("--order-by <alias>", "metric alias, groupBy field, or 'bucket'")
    .addOption(
      enumOption("--order <order>", "sort direction", ANALYTICS_QUERY_STRUCTURED__BODY_ORDER)
    )
    .option("--limit <n>", "max rows", (v) => parseInt(v, 10))
    .option("--show-sql", "print the generated SQL to stderr");

  metrics
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

  // Bound LAST, after every option exists and after the hand-written prose.
  // `bindCommand` reads the command's own options to find the divergences it
  // must render, so an option added afterwards would be invisible to the block
  // it already composed. Appending here also puts the generated reference BELOW
  // the Examples and Notes, which are the half carrying meaning a schema cannot.
  // `contract-help.test.ts` asserts that ordering rather than trusting it.
  bindCommand(overview, ANALYTICS_OVERVIEW_CONTRACT);
  bindCommand(feedback, ANALYTICS_FEEDBACK_CONTRACT);
  bindCommand(exportCsv, ANALYTICS_EXPORT_CONTRACT);
  bindCommand(query, ANALYTICS_QUERY_CONTRACT);
  // `Body.view` needs no `bodyOnly` exemption: it is bound to the `<view>`
  // positional above, which commander validates. The exemption that used to sit
  // here claimed positionals could not carry `.choices()`, which is false.
  bindCommand(metrics, ANALYTICS_QUERY_STRUCTURED_CONTRACT);
}
