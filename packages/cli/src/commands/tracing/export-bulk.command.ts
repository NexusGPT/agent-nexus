import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import {
  TRACING_EXPORT_BULK__BODY_FORMAT,
  TRACING_EXPORT_BULK__BODY_STATUS,
  TRACING_EXPORT_BULK_CONTRACT
} from "../tracing.contract.generated";

/** `nexus tracing export-bulk` — many traces, throttled. */
export function registerTracingExportBulkCommand(tracing: Command, program: Command): void {
  const exportBulk = tracing
    .command("export-bulk")
    .description("Bulk export traces — max 500 per call, rate limited to 5 calls a minute")
    .addOption(
      enumOption("--format <fmt>", "Output format", TRACING_EXPORT_BULK__BODY_FORMAT).default(
        "json"
      )
    )
    .addOption(
      enumOption("--status <status>", "Filter by status", TRACING_EXPORT_BULK__BODY_STATUS)
    )
    .option("--agent-id <id>", "Filter by agent ID")
    .option("--workflow-id <id>", "Filter by workflow ID")
    .option("--start-date <iso>", "Filter from date")
    .option("--end-date <iso>", "Filter to date")
    .option("--limit <n>", "Max traces to export (1-500, default 100)", "100")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing export-bulk --format csv > traces.csv
  $ nexus tracing export-bulk --status FAILED --limit 50
  $ nexus tracing export-bulk --limit 500 --start-date 2026-03-01 > march.json

Notes:
  --limit IS CAPPED AT 500 AND IS NOT PAGED. Asking for more is refused
  outright, and there is no cursor — narrow with --start-date / --end-date and
  export the window in slices. The default is 100, so a bare call SILENTLY
  EXPORTS ONLY THE FIRST 100 traces and says nothing about the rest.
  RATE LIMITED TO 5 CALLS PER MINUTE. The sixth answers 429, so a slicing loop
  needs to pace itself.
  IT PRINTS THE PAYLOAD TO STDOUT AND NOTHING ELSE — redirect it to a file.
  --format takes json or csv, default json.
  Count what you got against "nexus tracing traces --json" for the same filters
  before treating an export as complete.
  UNDER --format json THE DOCUMENT IS A BARE ARRAY, with no data/meta envelope.
  Every list command here answers {data, meta}; this one does not, because it is
  a file and not a page — iterate the top level directly, since a ".data" read
  finds nothing. Each element is one trace in exactly the shape
  "tracing export <id>" writes, its generations nested inside it and UNCAPPED.
  --json CHANGES NOTHING HERE. This command never reads it; the payload is
  already the output, and --format decides its form.`
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
        console.log(result.content);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(exportBulk, TRACING_EXPORT_BULK_CONTRACT);
}
