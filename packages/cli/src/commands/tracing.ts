import { Command } from "commander";

import { registerTracingCostBreakdownCommand } from "./tracing/cost-breakdown.command";
import { registerTracingDeleteCommand } from "./tracing/delete.command";
import { registerTracingExportCommand } from "./tracing/export.command";
import { registerTracingExportBulkCommand } from "./tracing/export-bulk.command";
import { registerTracingGenerationCommand } from "./tracing/generation.command";
import { registerTracingGenerationsCommand } from "./tracing/generations.command";
import { registerTracingModelsCommand } from "./tracing/models.command";
import { registerTracingSummaryCommand } from "./tracing/summary.command";
import { registerTracingTimelineCommand } from "./tracing/timeline.command";
import { registerTracingTraceCommand } from "./tracing/trace.command";
import { registerTracingTracesCommand } from "./tracing/traces.command";

export function registerTracingCommands(program: Command): void {
  const tracing = program
    .command("tracing")
    .description("View LLM traces and analytics — a 7-day window, not an audit log");

  tracing.addHelpText(
    "after",
    `
TRACES EXPIRE. Retention is 7 days by default and can never be set BELOW 7 —
a shorter value is refused and falls back to 7. It is a server-side setting
with no public-API control, so treat anything older than a week as gone:
"tracing export" / "export-bulk" while it is still there, or lose it.

A TRACE IS A RUN, A GENERATION IS ONE MODEL CALL. One trace holds many
generations, and cost/tokens on the trace are the sum over its generations.

WHERE THE COST FIELDS ARE: totalCostUsd on a trace, costUsd on a generation,
both plain USD. The legacy costInUSDTenThousandths is NOT part of this API's
responses — code still reading it gets undefined, not a number.

WHAT IS ONLY IN ONE PLACE: the system prompt, the messages and the response
text come back from "tracing generation <id>" and from nowhere else — and
even there only under --json, because the table view prints metadata only.

Deleting is real: "tracing delete" removes the trace AND its generations, and
nothing else in the platform keeps a copy.

THIS NAMESPACE READS ROWS; "nexus analytics" AGGREGATES THE SAME DATA. Every
command here answers "what did this run do", one trace or one generation at a
time, and the only shaping on offer is the fixed grouping of cost-breakdown. A
cross-cutting question — an arbitrary group-by, a join, the earliest startedAt
still retained — is not expressible here and is a one-liner over the
analytics_traces and analytics_generations views:

  $ nexus analytics query "SELECT min(startedAt) FROM analytics_traces"

Same window, same data. Use that to establish what retention actually leaves
you before concluding a trace is missing.`
  );

  registerTracingTracesCommand(tracing, program);
  registerTracingTraceCommand(tracing, program);
  registerTracingDeleteCommand(tracing, program);
  registerTracingGenerationsCommand(tracing, program);
  registerTracingGenerationCommand(tracing, program);
  registerTracingModelsCommand(tracing, program);
  registerTracingSummaryCommand(tracing, program);
  registerTracingCostBreakdownCommand(tracing, program);
  registerTracingTimelineCommand(tracing, program);
  registerTracingExportCommand(tracing, program);
  registerTracingExportBulkCommand(tracing, program);
}
