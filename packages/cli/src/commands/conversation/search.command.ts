import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";

/** `nexus conversation search` */
export function registerConversationSearchCommand(conversation: Command, program: Command): void {
  conversation
    .command("search")
    .description("Search conversations by topic or message content")
    .requiredOption("--query <text>", "Search query")
    .option("--deployment-id <id>", "Limit to a specific deployment")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation search --query "refund"
  $ nexus conversation search --query "login issue" --deployment-id 11111111-1111-4111-8111-111111111111 --json

Notes:
  CAPPED AT 50 RESULTS WITH NO WAY TO PAGE PAST THEM. There is no --limit and
  no cursor, and nothing marks the cut — 50 rows means "at least 50". Use
  "conversation list --search" instead when the count matters: same substring
  match, plus every filter and real pagination.

  SEARCHES A PHONE NUMBER TOO, which list does not. When the query looks like
  a phone number it also matches the customer's number and the channel thread
  id, so "conversation search --query +15551234567" finds a caller's
  conversations. That is the one thing this command does that list cannot.
  Substring and case-insensitive over the topic and message bodies — no
  stemming, no relevance ranking; results are newest-activity first.
  --query is 1-500 characters. Closed conversations are excluded.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const conversations = await client.conversations.search({
          query: opts.query,
          deploymentId: opts.deploymentId
        });

        printList(conversations, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "topic", label: "TOPIC", width: 30 },
          { key: "status", label: "STATUS", width: 10 },
          { key: "lastMessagePreview", label: "LAST MESSAGE", width: 40 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
