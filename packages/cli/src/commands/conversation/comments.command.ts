import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";

/** `nexus conversation comments` */
export function registerConversationCommentsCommand(conversation: Command, program: Command): void {
  conversation
    .command("comments")
    .description("List internal comments on a conversation")
    .argument("<id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation comments 11111111-1111-4111-8111-111111111111
  $ nexus conversation comments 11111111-1111-4111-8111-111111111111 --json

Notes:
  Internal notes only — none of this was seen by the customer. The customer
  side is "conversation messages <id> --visible-only".
  Unpaginated, oldest first.
  THE AUTHOR COLUMN IS BLANK ON EVERY COMMENT THIS API WROTE. "conversation
  comment" stores the author's user id and no display name, so authorName reads
  null for those rows and only comments left in the dashboard carry one. Read
  authorId in --json and resolve the name yourself; a blank AUTHOR does not mean
  the comment is unattributed.
  A stored comment that does not match the current schema is SKIPPED rather
  than reported, so this list can be shorter than what is on the record.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getComments(id);
        const comments = result.comments ?? result;

        printList(comments, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "content", label: "CONTENT", width: 50 },
          { key: "authorName", label: "AUTHOR", width: 20 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
