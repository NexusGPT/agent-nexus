import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { color, printEnvelope, printTable } from "../../output";
import { NO_CONVERSATION_HINT, NO_CONVERSATION_MESSAGE } from "./_shared/no-conversation";
import { resolveControlSession } from "./_shared/resolve-control-session";
import { CHAT_HISTORY_HELP } from "./history.help";

/**
 * The part types of one message, in order — what the terminal shows for `parts`.
 *
 * A message is its PARTS, and `text` is only their plain-string fallback: a card,
 * an attachment, a code-interpreter block and a failed turn's error exist as
 * parts alone. Without this column a transcript holding a card reads as a row of
 * prose and nothing else.
 */
function formatPartTypes(parts: unknown): string {
  if (!Array.isArray(parts)) return "—";
  const types = parts.map((part: unknown) =>
    typeof part === "object" && part !== null && "type" in part && typeof part.type === "string"
      ? part.type
      : "?"
  );
  return types.join(", ") || "—";
}

/** `nexus chat history` — one page of the transcript a session token names. */
export function registerChatHistoryCommand(chat: Command, program: Command): Command {
  return chat
    .command("history")
    .description("Read one page of a conversation's transcript, newest page first")
    .argument("<deployment-id>", "Deployment ID (must be an EMBED or API channel)")
    .option("--session-token <token>", "The session token naming the conversation")
    .option("--chat-id <uuid>", "Mint a session for this EXISTING conversation instead")
    .option("--before <message-id>", "Read the page OLDER than this message id")
    .option("--limit <n>", "How many messages, 1-50 (server default 20)", (value: string) =>
      Number(value)
    )
    .addHelpText("after", CHAT_HISTORY_HELP)
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const chatSession = await resolveControlSession(client, deploymentId, opts);
        if (chatSession === null) {
          process.exitCode = refuse(NO_CONVERSATION_MESSAGE, NO_CONVERSATION_HINT);
          return;
        }

        const page = await client.chat.history(
          deploymentId,
          { token: chatSession.token },
          { before: opts.before, limit: opts.limit }
        );

        printEnvelope(page, () => {
          printTable(page.messages, [
            { key: "createdAt", label: "AT", width: 24 },
            { key: "role", label: "ROLE", width: 9 },
            { key: "text", label: "TEXT", width: 56 },
            { key: "parts", label: "PARTS", width: 40, format: formatPartTypes },
            { key: "id", label: "ID", width: 38 }
          ]);

          // Silent when nothing is older: a footer on a complete transcript is
          // noise. The cursor is the FIRST message because a page is
          // oldest-first — the last one would re-read the page just shown.
          const oldest = page.messages[0];
          if (page.hasMore && oldest !== undefined) {
            console.log(
              color.dim(
                `\nOLDER MESSAGES EXIST — read the page before this one with --before ${oldest.id}`
              )
            );
          }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
