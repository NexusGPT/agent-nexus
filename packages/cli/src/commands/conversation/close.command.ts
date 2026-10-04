import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus conversation close` */
export function registerConversationCloseCommand(conversation: Command, program: Command): void {
  conversation
    .command("close")
    .description("Close a conversation — it disappears from every list, with no reopen")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation close 11111111-1111-4111-8111-111111111111

Notes:
  THERE IS NO REOPEN. This sets a DELETED status that "conversation
  update-status" cannot set back — it accepts only OPEN, RUNNING and ARCHIVED.
  If you want it out of the way but recoverable, use
  "conversation update-status <id> --status ARCHIVED" instead.

  IT VANISHES FROM "conversation list" AND "conversation search" AND STAYS
  READABLE BY ID. "conversation get", "conversation messages", "conversation
  comments" and "conversation get-metadata" all still answer afterwards, and
  "get" reports status DELETED — the one status a read reports and no write can
  set. The messages are not erased and the transcript stays reachable, so the
  disappearance from both lists is the whole of what a close hides.
  THE WRITE PATHS REFUSE A CLOSED CONVERSATION with a 404: "assign",
  "update-status", "comment", "mark-as-read", and a second "close".
  Runs with no prompt and no --yes, on one call.
  Needs conversations:delete, which conversations:write does not imply.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.conversations.close(id);
        printSuccess("Conversation closed.", { id, deleted: true });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
