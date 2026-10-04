import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus conversation mark-as-read` */
export function registerConversationMarkAsReadCommand(
  conversation: Command,
  program: Command
): void {
  conversation
    .command("mark-as-read")
    .description("Mark a conversation as read")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation mark-as-read 11111111-1111-4111-8111-111111111111

Notes:
  Clears the inbox unread flag on the conversation and nothing else — no
  status change, no read receipt to the customer, no effect on the agent.
  Organization-wide, not per user: the conversation is read for everybody.
  There is no mark-as-unread. A new inbound message sets it back.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.conversations.markAsRead(id);
        printSuccess("Conversation marked as read.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
