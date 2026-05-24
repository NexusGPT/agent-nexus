import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord } from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";

export function registerAnalyticsCommands(program: Command): void {
  const analytics = program.command("analytics").description("View analytics and metrics");

  // ── overview ──────────────────────────────────────────────────────────
  analytics
    .command("overview")
    .description("Get analytics overview")
    .option("--time-period <period>", "Time period (7d, 30d, 90d, etc.)")
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
      .option("--time-period <period>", "Time period")
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
    .option("--time-period <period>", "Time period")
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
}
