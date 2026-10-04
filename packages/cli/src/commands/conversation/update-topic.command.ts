import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus conversation update-topic` */
export function registerConversationUpdateTopicCommand(
  conversation: Command,
  program: Command
): void {
  conversation
    .command("update-topic")
    .description("Set or replace a conversation's topic")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .requiredOption("--topic <text>", "New topic (1-500 chars)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation update-topic 11111111-1111-4111-8111-111111111111 --topic "Billing escalation"
  $ nexus conversation update-topic 4M7O9_BS76Q --topic "VIP renewal"

Notes:
  THIS FIRES THE 'conversation.tagged' PLATFORM EVENT. Any listener workflow
  subscribed to topic changes runs, so renaming a hundred conversations in a
  loop triggers a hundred workflow executions with whatever they do attached.
  Check "nexus workflow list" for listeners before scripting this.
  --topic is REQUIRED and 1-500 characters; there is no way to clear it.
  It REPLACES the topic outright. The previous one is not kept anywhere.
  <id> takes a UUID or a nanoId.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const conv = await client.conversations.updateTopic(id, { topic: opts.topic });
        printRecord(conv, [
          { key: "id", label: "ID" },
          { key: "nanoId", label: "NanoId" },
          { key: "topic", label: "Topic" },
          { key: "status", label: "Status" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
