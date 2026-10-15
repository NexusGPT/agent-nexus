import type { Command } from "commander";

import { createClient } from "../../client";
import {
  bindCommand,
  enumArgument,
  enumInCompositeOption,
  enumOption
} from "../../contract-binding";
import { handleError } from "../../errors";
import {
  ANALYTICS_QUERY_STRUCTURED__BODY_FILTERS_ITEM_OP,
  ANALYTICS_QUERY_STRUCTURED__BODY_GRANULARITY,
  ANALYTICS_QUERY_STRUCTURED__BODY_ORDER,
  ANALYTICS_QUERY_STRUCTURED__BODY_PERIOD,
  ANALYTICS_QUERY_STRUCTURED__BODY_VIEW,
  ANALYTICS_QUERY_STRUCTURED_CONTRACT
} from "../analytics.contract.generated";
import { type MetricsOptions, parseMetricFilters } from "./_shared/metric-filters";
import { printQueryResult, reportQueryError } from "./_shared/print-query-result";
import { ANALYTICS_METRICS_HELP } from "./metrics.help";

/**
 * Every flag this command takes, added to a command the CALLER created.
 *
 * Split from the registrar so each stays under the 80-line cap: this half is
 * declarative and the half below is wiring. The ORDER matters and is preserved
 * — `bindCommand` reads the command's own options to find the divergences it
 * renders, so the reference block lists them exactly as declared here.
 *
 * 🔴 THE `.command("metrics")` CALL STAYS IN THE REGISTRAR, AND THAT IS NOT A
 * STYLE CHOICE. `json-shape.scan.ts` resolves a registration by walking the
 * receiver of each `.command()` back to the registrar's own parameter and then
 * tying it to the action body in the SAME registrar. Declaring the command here
 * and attaching `.action` below put those two in different functions, and the
 * scan reported `analytics metrics` as `no-registration` — so it silently lost
 * its `--json` shape line in `--help`, which is a published-surface regression
 * a green suite does not report. An options helper taking a command and
 * returning it is a shape the scan already resolves (`addPaginationOptions(x)`);
 * the sibling `query.command.ts` is the plain form of the same thing.
 *
 * `<view>` IS validated, exactly like the flags beside it. Commander checks
 * `.choices()` on a positional as readily as on an option — measured by driving
 * a junk value through a real program, not by reading `Argument`.
 */
function addMetricsOptions(metrics: Command): Command {
  return metrics
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
}

/** `nexus analytics metrics <view>` — the structured, non-SQL surface. */
export function registerAnalyticsMetricsCommand(analytics: Command, program: Command): void {
  const metrics = addMetricsOptions(
    analytics
      .command("metrics")
      .description("Run a structured (non-SQL) query over a curated analytics view")
  );

  metrics
    .addHelpText("after", ANALYTICS_METRICS_HELP)
    .action(async (view: string, opts: MetricsOptions) => {
      try {
        const filters = parseMetricFilters(opts.filter);
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
          reportQueryError(result.error);
          return;
        }

        if (opts.showSql) process.stderr.write(`SQL: ${result.generatedSql}\n`);

        printQueryResult(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists and after the hand-written prose.
  // `Body.view` needs no `bodyOnly` exemption: it is bound to the `<view>`
  // positional above, which commander validates. The exemption that used to sit
  // here claimed positionals could not carry `.choices()`, which is false.
  bindCommand(metrics, ANALYTICS_QUERY_STRUCTURED_CONTRACT);
}
