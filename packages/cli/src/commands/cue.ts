import { Command } from "commander";

import { registerCueConversationsCommand } from "./cue/conversations.command";
import { registerCueExportCommand } from "./cue/export.command";
import { registerCueTranscriptCommand } from "./cue/transcript.command";

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

  registerCueConversationsCommand(cue, program);
  registerCueTranscriptCommand(cue, program);
  registerCueExportCommand(cue, program);
}
