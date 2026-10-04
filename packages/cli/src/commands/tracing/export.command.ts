import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import {
  TRACING_EXPORT_TRACE__BODY_FORMAT,
  TRACING_EXPORT_TRACE_CONTRACT
} from "../tracing.contract.generated";

/** `nexus tracing export` — one trace, as a file. */
export function registerTracingExportCommand(tracing: Command, program: Command): void {
  const exportTrace = tracing
    .command("export")
    .description("Export a single trace")
    .argument("<id>", "Trace ID")
    .addOption(
      enumOption("--format <fmt>", "Output format", TRACING_EXPORT_TRACE__BODY_FORMAT).default(
        "json"
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing export 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b > trace.json
  $ nexus tracing export 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b --format csv > trace.csv

Notes:
  IT PRINTS THE PAYLOAD TO STDOUT AND NOTHING ELSE — redirect it to a file.
  --json does NOT apply here: the document is already the output, and asking
  for --format csv while passing --json still gives you CSV.
  --format takes json or csv, and defaults to json. CSV is one row per
  generation, so a trace with no generations exports headers only.
  THIS IS HOW YOU BEAT THE RETENTION WINDOW. Nothing is archived for you — an
  unexported trace is unrecoverable once it expires.
  UNDER --format json THE DOCUMENT IS A BARE OBJECT — one trace, its generations
  nested in a "generations" array. No data/meta envelope and no outer array, so
  this command and "export-bulk" need DIFFERENT parsers: export-bulk hands back
  a LIST of exactly this object.
  THE NESTED GENERATIONS ARE UNCAPPED HERE, where "tracing trace <id>" stops at
  100 — and they still carry no systemPrompt, no messages and no response.
  This route is NOT under the five-calls-a-minute throttle that "export-bulk"
  documents; only export-bulk is. The plan's own rate limit still applies, so a
  burst can answer 429 at a different threshold.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.exportTrace(id, { format: opts.format });
        console.log(result.content);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(exportTrace, TRACING_EXPORT_TRACE_CONTRACT);
}
