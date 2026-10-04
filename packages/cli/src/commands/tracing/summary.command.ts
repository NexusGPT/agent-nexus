import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus tracing summary` — the window's totals. */
export function registerTracingSummaryCommand(tracing: Command, program: Command): void {
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
  $ nexus tracing summary --json

Notes:
  TOTAL COST ($) 0.0000 CAN MEAN "NO TRACES", NOT "NO SPEND". The sum is
  reported as 0 when nothing matched, so read Total Traces beside it before
  concluding anything about money.
  WITH NO DATES THIS COVERS THE RETENTION WINDOW ONLY, so it is never a
  lifetime total.
  THE PERIOD-OVER-PERIOD COMPARISON IS --json ONLY, and only appears when you
  pass BOTH --start-date and --end-date. The previous period is then the window
  of the same length immediately before yours, and the table view never shows
  it. With one date or none, previousPeriod is null.
  Completed + Failed + In Progress can be less than Total Traces — a status
  outside those three is counted in the total and in none of the three.
  UNPRICED CALLS > 0 MEANS TOTAL COST ($) IS LOW BY AN UNKNOWN AMOUNT. Those
  calls had no price to look up and sit in the total at $0. The row discloses
  it; it never corrects the total, because the missing amount is unknown rather
  than merely unreported. "nexus tracing cost-breakdown" and "timeline" carry
  the same column per group and per bucket, which is where you find WHICH spend
  is missing.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const summary = await client.tracing.getSummary({
          startDate: opts.startDate,
          endDate: opts.endDate
        });
        printRecord(summary, [
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
          { key: "distinctModelCount", label: "Distinct Models" },
          {
            key: "unpricedGenerationCount",
            label: "Unpriced Calls",
            // A bare number reads as a statistic. It is a caveat on the line
            // above it: those calls are in Total Cost at $0, so the total is LOW
            // by an unknown amount. Say so, rather than leaving the reader to
            // know that a spend total silently absorbs what it could not price.
            format: (v) =>
              Number(v) > 0
                ? `${Number(v)} — no price found, so Total Cost is LOW by an unknown amount`
                : "0"
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
