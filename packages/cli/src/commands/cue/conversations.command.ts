import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import { CUE_TRANSCRIPTS_LIST_CONVERSATIONS_CONTRACT } from "../cue.contract.generated";

/** `nexus cue conversations` */
export function registerCueConversationsCommand(cue: Command, program: Command): void {
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

  bindCommand(conversations, CUE_TRANSCRIPTS_LIST_CONVERSATIONS_CONTRACT);
}
