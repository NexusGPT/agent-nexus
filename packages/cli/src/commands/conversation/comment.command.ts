import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { resolveInputValue } from "../../util/stdin";

/** `nexus conversation comment` */
export function registerConversationCommentCommand(conversation: Command, program: Command): void {
  conversation
    .command("comment")
    .description("Add an internal comment to a conversation")
    .argument("<id>", "Conversation ID")
    .requiredOption("--body <text-or-->", "Comment text (or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation comment 11111111-1111-4111-8111-111111111111 --body "Escalated to tier 2"
  $ echo "Detailed note" | nexus conversation comment 11111111-1111-4111-8111-111111111111 --body -

Notes:
  INTERNAL ONLY — the customer never sees this, and it is not sent anywhere.
  "conversation send-message" is the one that reaches them. Getting these two
  the wrong way round is how a private note reaches a customer.
  Comments are searchable from "conversation list --comment-contains", which
  is what makes them usable as workflow markers (e.g. END_CONV_FIRED_AT:).
  Append-only: there is no edit and no delete. Content must be non-empty.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const content = await resolveInputValue(opts.body);
        await client.conversations.addComment(id, { content });
        printSuccess("Comment added.", { conversationId: id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
