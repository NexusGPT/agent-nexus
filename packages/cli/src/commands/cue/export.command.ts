import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import {
  CUE_TRANSCRIPTS_EXPORT__PARAMS_FORMAT,
  CUE_TRANSCRIPTS_EXPORT_CONTRACT
} from "../cue.contract.generated";

/** `nexus cue export` */
export function registerCueExportCommand(cue: Command, program: Command): void {
  const exportAll = cue
    .command("export")
    .description("Stream every transcript in a date range to stdout (NDJSON by default)")
    .option("--start-date <iso>", "Only conversations updated on or after this date (ISO 8601)")
    .option("--end-date <iso>", "Only conversations updated on or before this date (ISO 8601)")
    .addOption(
      enumOption(
        "--format <format>",
        "output framing (default ndjson)",
        CUE_TRANSCRIPTS_EXPORT__PARAMS_FORMAT
      ).default("ndjson")
    )
    .option("--limit <number>", "Cap how many conversations to emit (1-10000)", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cue export > corpus.ndjson
  $ nexus cue export --start-date 2026-08-01 --end-date 2026-08-15 > august.ndjson
  $ nexus cue export --limit 10 --format json > sample.json
  $ nexus cue export --start-date 2026-08-14 | jq -c '.conversation.id'

Notes:
  THE OUTPUT IS THE PAYLOAD, VERBATIM. This command prints what the server
  streamed and adds nothing — no envelope, no progress, no summary line. Redirect
  it to a file.
  NDJSON IS THE DEFAULT FOR A REASON. One document per line means a truncated
  transfer costs the trailing document; a truncated JSON array is unparseable.
  Use --format json only when the consumer cannot read line-delimited input.
  --limit CAPS CONVERSATIONS, NOT ROWS. No transcript is ever truncated: a
  conversation is emitted whole or not at all.
  🚨 THE CLI BUFFERS THE WHOLE RESPONSE BEFORE PRINTING IT, even though the
  server streams. A range wide enough to matter should be fetched with curl
  against GET /api/public/v1/cue/transcripts/export instead, which streams
  end to end.
  RATE LIMITED to 5 requests per minute per organization. A 429 here means slow
  down, not that the range was too large.`
    )
    .action(
      async (opts: { startDate?: string; endDate?: string; format?: string; limit?: number }) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const body = await client.cueTranscripts.export({
            startDate: opts.startDate,
            endDate: opts.endDate,
            format: opts.format === "json" ? "json" : "ndjson",
            limit: opts.limit
          });
          // `process.stdout.write`, not `console.log`: NDJSON already ends in a
          // newline and an added one would make a blank final line that a strict
          // line reader counts as a document.
          process.stdout.write(body);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // Bound LAST, after every option exists — see `bindCommand`. This is what puts
  // the contract's own enum values behind `--format`, so `--format ndsjon` is
  // refused here with the list that would have worked instead of crossing the
  // network to come back a 400 naming nothing.
  bindCommand(exportAll, CUE_TRANSCRIPTS_EXPORT_CONTRACT);
}
