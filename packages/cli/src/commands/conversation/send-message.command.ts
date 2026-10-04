import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { resolveInputValue } from "../../util/stdin";

/** `nexus conversation send-message` */
export function registerConversationSendMessageCommand(
  conversation: Command,
  program: Command
): void {
  conversation
    .command("send-message")
    .description("Send a real message to the customer as the agent — it leaves immediately")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .requiredOption("--body <text-or-->", "Message content (or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation send-message 11111111-1111-4111-8111-111111111111 --body "Your issue has been resolved."
  $ echo "Long reply" | nexus conversation send-message 11111111-1111-4111-8111-111111111111 --body -

Notes:
  THE CUSTOMER RECEIVES THIS ON THEIR REAL CHANNEL — WhatsApp, email, the web
  widget, whatever the conversation is on. There is no draft, no confirmation
  and no recall. "conversation comment" is the internal one.
  It is recorded as coming from the AGENT, not from you by name, so the
  customer cannot tell a human took over. Your user id is kept internally for
  intervention reporting.
  Sending does NOT take the conversation off the agent. Set
  --response-handling MANUAL first or the agent may answer over you.
  Content must be non-empty, and it is plain text: a WhatsApp template message
  goes through "conversation send-template" instead.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const content = await resolveInputValue(opts.body);
        await client.conversations.sendAgentMessage(id, { content });
        printSuccess("Agent message sent.", { conversationId: id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
