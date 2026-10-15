import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import {
  ANALYTICS_EXPORT__PARAMS_TIME_PERIOD,
  ANALYTICS_EXPORT_CONTRACT
} from "../analytics.contract.generated";
import { timePeriodOption } from "./_shared/time-period-option";

/** `nexus analytics export` */
export function registerAnalyticsExportCommand(analytics: Command, program: Command): void {
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
  $ nexus analytics export --deployment-id 11111111-1111-4111-8111-111111111111

Notes:
  Outputs CSV to stdout. Redirect to file: nexus analytics export > report.csv

  IT IS NOT ONE ROW PER CONVERSATION. The header is
  Section,Metric,Value,CreatedAt,ChatId and the file is three stacked blocks
  keyed by Section, always in this order:
    Summary     five rows — Time Period, Total Conversations, Total Messages,
                Total Cost (USD), Total Unique Users.
    Deployment  one row per deployment; Metric is its name and Value is its
                CONVERSATION count, nothing else.
    Message     one row per message; Metric is the message type and Value is
                the content TRUNCATED TO 200 CHARACTERS.
  CreatedAt and ChatId are EMPTY on every Summary and Deployment row. Filter on
  Section before you read Value as a number, or the Message block poisons the
  column.

  PER-MODEL AND PER-SOURCE COST ARE COMPUTED AND NEVER WRITTEN. The export
  builds both breakdowns and emits neither, so no --flag here reaches them —
  use "nexus tracing cost-breakdown" for spend by model.`
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

  // Bound LAST, after every option exists and after the hand-written prose.
  bindCommand(exportCsv, ANALYTICS_EXPORT_CONTRACT);
}
