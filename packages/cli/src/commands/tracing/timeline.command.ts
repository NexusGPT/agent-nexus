import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import {
  TRACING_ANALYTICS_TIMELINE__PARAMS_GRANULARITY,
  TRACING_ANALYTICS_TIMELINE_CONTRACT
} from "../tracing.contract.generated";

/** `nexus tracing timeline` — the window as a bucketed series. */
export function registerTracingTimelineCommand(tracing: Command, program: Command): void {
  const timeline = tracing
    .command("timeline")
    .description("Get tracing timeline data")
    .addOption(
      enumOption(
        "--granularity <g>",
        "Granularity",
        TRACING_ANALYTICS_TIMELINE__PARAMS_GRANULARITY
      ).default("day")
    )
    .option("--start-date <iso>", "Period start")
    .option("--end-date <iso>", "Period end")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing timeline
  $ nexus tracing timeline --granularity hour --start-date 2026-03-29 --json

Notes:
  --granularity TAKES hour, day OR week, and defaults to day. Anything else is
  refused.
  BUCKETS WITH NO TRACES ARE ABSENT, NOT ZERO. The series is not gap-filled, so
  a quiet hour is a MISSING ROW — a chart that joins consecutive points will
  draw straight through the gap. Fill the gaps yourself from the dates you
  asked for.
  Buckets are cut on the trace's START time, so a run spanning midnight sits
  entirely in the bucket it began in.
  COST ($) 0.0000 in a bucket is a real zero for that bucket; a bucket with no
  cost at all is missing rather than zero.
  UNPRICED > 0 MEANS THAT BUCKET'S COST ($) IS LOW BY AN UNKNOWN AMOUNT. Those
  calls had no price to look up and sit in the bucket's cost at $0. Watch this
  column across the series: a model that stops being priced makes COST ($)
  FLATTEN while GENS keeps climbing, which reads exactly like traffic that got
  cheaper. UNPRICED is a subset of GENS and never corrects COST ($).
  Same retention window as everything else — "--granularity week" over a
  7-day window gives you one or two rows, not a quarter.
  THE DATE COLUMN IS CUT, AND THE BUCKET KEY IS NOT A DATE. The server sends a
  full ISO instant — 2026-08-06T00:00:00.000Z, 24 characters — into a column 22
  wide, so every row renders 2026-08-06T00:00:00.0… at every granularity. Key a
  chart off the "date" field under --json, never off the table: the cut string
  parses as a different instant, or as nothing at all. "tracing cost-breakdown
  --bucket" cuts its own BUCKET column the same way.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.getTimeline({
          granularity: opts.granularity,
          startDate: opts.startDate,
          endDate: opts.endDate
        });
        const points = result.points ?? [];
        printList(points, undefined, [
          { key: "date", label: "DATE", width: 22 },
          { key: "traceCount", label: "TRACES", width: 8 },
          { key: "generationCount", label: "GENS", width: 8 },
          { key: "unpricedGenerationCount", label: "UNPRICED", width: 9 },
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

  // Bound LAST, after every option exists.
  bindCommand(timeline, TRACING_ANALYTICS_TIMELINE_CONTRACT);
}
