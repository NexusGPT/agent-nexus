import type { ConversationMessage } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { type Column, isJsonMode, printList } from "../../output";
import { MESSAGES_NOTES } from "./copy/messages-notes";

/** `nexus conversation messages` */
export function registerConversationMessagesCommand(conversation: Command, program: Command): void {
  conversation
    .command("messages")
    .description("Get messages in a conversation")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .option("--limit <n>", "Max messages to fetch (default: 50, max: 100)")
    .option(
      "--before <cursor>",
      "Page cursor — the previous page's nextBefore (a bare ISO date works, but can skip rows)"
    )
    .option(
      "--visible-only",
      "Only records the customer actually saw — hides tool results, tool-call turns and other agent-runtime rows"
    )
    .addHelpText("after", MESSAGES_NOTES)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getMessages(id, {
          limit: opts.limit ? Number(opts.limit) : undefined,
          before: opts.before,
          visibleOnly: opts.visibleOnly ? true : undefined
        });

        // Pagination state belongs in a JSON field, not a prose trailer.
        // In JSON mode embed `hasMore` in meta so the output stays a single
        // parseable document; in human mode keep the readable trailer (NEX-2176).
        const columns: Column<ConversationMessage>[] = [
          { key: "id", label: "ID", width: 36 },
          { key: "role", label: "ROLE", width: 8 },
          { key: "senderType", label: "SENDER", width: 12 },
          // TYPE is what separates a real reply from tool plumbing — without it
          // the human-mode table shows six identical-looking AGENT rows.
          { key: "type", label: "TYPE", width: 13 },
          { key: "content", label: "CONTENT", width: 60 },
          { key: "createdAt", label: "CREATED", width: 24 }
        ];
        const messages = result.messages;
        if (isJsonMode()) {
          // `nextBefore` travels with `hasMore`: under --visible-only a page is
          // filtered after it is read, so a script must page with the server's
          // cursor rather than the oldest row it can see. It is opaque — an
          // `<iso>_<id>` pair, not a date — and goes back out unmodified.
          printList(messages, { hasMore: result.hasMore, nextBefore: result.nextBefore }, columns);
        } else {
          printList(messages, undefined, columns);
          if (result.hasMore) {
            console.log(
              `\n(more messages available — use --before ${result.nextBefore ?? "<cursor>"} to paginate)`
            );
          }
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
