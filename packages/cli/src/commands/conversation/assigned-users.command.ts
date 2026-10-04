import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus conversation assigned-users` */
export function registerConversationAssignedUsersCommand(
  conversation: Command,
  program: Command
): void {
  conversation
    .command("assigned-users")
    .description("Get assigned users for a conversation")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation assigned-users 11111111-1111-4111-8111-111111111111
  $ nexus conversation assigned-users 11111111-1111-4111-8111-111111111111 --json

Notes:
  Read this before "conversation assign", which REPLACES the whole list rather
  than adding to it.
  An empty list means unassigned — it is not an error, and it is what
  "conversation list --assigned-to none" selects on.
  IT ALSO ANSWERS responseHandling, WHICH IS WHY ONE READ IS ENOUGH. The
  response is {userIds, responseHandling}, so the two facts a handover needs —
  who has it, and whether the agent is still replying — come back together.
  Assignment does NOT stop the agent; "conversation update-status <id>
  --response-handling MANUAL" does. Reading AUTO here is the signal to send it.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getAssignedUsers(id);
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
