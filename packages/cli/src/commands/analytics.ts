import { Command } from "commander";

import { ANALYTICS_PUBLIC_VIEWS } from "./analytics/_shared/fold-list";
import { registerAnalyticsExportCommand } from "./analytics/export.command";
import { registerAnalyticsFeedbackCommand } from "./analytics/feedback.command";
import { registerAnalyticsMetricsCommand } from "./analytics/metrics.command";
import { registerAnalyticsOverviewCommand } from "./analytics/overview.command";
import { registerAnalyticsQueryCommand } from "./analytics/query.command";

/**
 * `nexus analytics` — three read surfaces over one dataset.
 *
 * This file is wiring and the namespace's own `--help`. Each leaf owns its
 * options, its hand-written Notes and its `bindCommand` call, in that order;
 * the ordering is PER COMMAND, so the generated reference still lands below
 * that command's Notes exactly as it did when every leaf lived here.
 * `contract-help.test.ts` asserts that ordering rather than trusting it.
 */
export function registerAnalyticsCommands(program: Command): void {
  const analytics = program.command("analytics").description("View analytics and metrics");

  analytics.addHelpText(
    "after",
    `
THREE READ SURFACES OVER ONE DATASET, AND ONLY ONE TAKES A QUESTION YOU WROTE.
"overview" is a fixed KPI bundle — you choose --time-period and --deployment-id
and nothing else. "metrics" is a structured aggregation over eight curated views
named plainly:
  ${ANALYTICS_PUBLIC_VIEWS}.
"query" is read-only SQL over the SAME eight, each named analytics_<view>.

REACH FOR "metrics" FIRST. It checks your columns against the view's own catalog
and refuses a wrong one BY NAME, where a mistyped column in raw SQL comes back
as a database error. Drop to "query" only for what the structured form cannot
express — a join, a window function, a min()/max() over the window.

"feedback" and "export" are separate reads and share neither surface: they take
no view, no metric and no group-by.`
  );

  // Registration ORDER is the published surface: commander renders subcommands
  // in declaration order, so this sequence matches the pre-split file's.
  registerAnalyticsOverviewCommand(analytics, program);
  registerAnalyticsFeedbackCommand(analytics, program);
  registerAnalyticsExportCommand(analytics, program);
  registerAnalyticsQueryCommand(analytics, program);
  registerAnalyticsMetricsCommand(analytics, program);
}
