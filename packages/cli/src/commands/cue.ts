import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { isJsonMode, printList } from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import {
  CUE_TRANSCRIPTS_EXPORT__PARAMS_FORMAT,
  CUE_TRANSCRIPTS_EXPORT_CONTRACT,
  CUE_TRANSCRIPTS_GET_TRANSCRIPT_CONTRACT,
  CUE_TRANSCRIPTS_LIST_CONVERSATIONS_CONTRACT
} from "./cue.contract.generated";

export function registerCueCommands(program: Command): void {
  const cue = program
    .command("cue")
    .description("Export full Cue conversation transcripts, including every subagent trace");

  cue.addHelpText(
    "after",
    `
WHAT A TRANSCRIPT CONTAINS. One document per conversation: the lead's turns
plus the FULL transcript of every subagent the session spawned — not the
summary the subagent returned to the main loop — nested under the tool-use id
that spawned it. Rows are raw: content, tool calls, tool results, reasoning,
model and provider, exactly as the runner wrote them.

EVERY DOCUMENT IS STAMPED WITH schemaVersion ("cue.transcript/v1"). Match on it
before parsing. A corpus on disk carries no URL, so the version travels on the
document rather than on the route that served it.

THE DATE WINDOW IS updatedAt, NOT createdAt. --start-date / --end-date bound
when a conversation was last touched, so the same window that scopes a corpus
pull also answers "what changed since my last export": pass the previous run's
exportedAt as --start-date and you get exactly the sessions that moved.

"cue export" PRINTS TO STDOUT AND IS MEANT TO BE REDIRECTED. NDJSON by default,
one document per line, so a reader can stream it. It is rate limited to 5
requests per minute per organization — this is a bulk pull, not a poll.`
  );

  // ── conversations ─────────────────────────────────────────────────────
  const conversations = addPaginationOptions(
    cue
      .command("conversations")
      .description("List Cue conversations (metadata only, no transcript content)")
      .option("--start-date <iso>", "Only conversations updated on or after this date (ISO 8601)")
      .option("--end-date <iso>", "Only conversations updated on or before this date (ISO 8601)")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus cue conversations
  $ nexus cue conversations --start-date 2026-08-01 --limit 100
  $ nexus cue conversations --json

Notes:
  messageCount COUNTS EVERY ROW OF THE CONVERSATION — lead rows and subagent
  rows together. It is the size of the transcript you would pull, not the
  number of user-visible turns.
  The window filters updatedAt. A session that started before --start-date and
  ran into the window IS included, which is what you want for a corpus and is
  not what a createdAt filter would do.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.cueTranscripts.listConversations({
        ...getPaginationParams(opts),
        startDate: opts.startDate,
        endDate: opts.endDate
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "title", label: "TITLE", width: 32 },
        { key: "modelId", label: "MODEL", width: 22 },
        { key: "messageCount", label: "ROWS", width: 6 },
        { key: "updatedAt", label: "UPDATED", width: 20 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── transcript (get one) ──────────────────────────────────────────────
  const transcript = cue
    .command("transcript")
    .description("Print one conversation's full transcript as JSON")
    .argument("<id>", "Cue conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cue transcript 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b > session.json
  $ nexus cue transcript 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b | jq '.counts'

Notes:
  THERE IS NO TABLE VIEW AND --json CHANGES NOTHING HERE. The whole point of
  this command is the raw document, so it always prints JSON — redirect it.
  A conversation belonging to another organization answers 404, not 403.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const document = await client.cueTranscripts.getTranscript(id);
        // Unindented under --json so a pipeline reads one compact object;
        // pretty otherwise, because a human ran this at a terminal.
        console.log(isJsonMode() ? JSON.stringify(document) : JSON.stringify(document, null, 2));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── export (bulk) ─────────────────────────────────────────────────────
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
  bindCommand(conversations, CUE_TRANSCRIPTS_LIST_CONVERSATIONS_CONTRACT);
  bindCommand(transcript, CUE_TRANSCRIPTS_GET_TRANSCRIPT_CONTRACT);
  bindCommand(exportAll, CUE_TRANSCRIPTS_EXPORT_CONTRACT);
}
