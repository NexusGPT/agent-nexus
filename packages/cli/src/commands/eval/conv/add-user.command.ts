import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope } from "../../../output";
import { GOLDEN_CONVERSATION_ADD_USER_TURN_CONTRACT } from "../../eval.contract.generated";

/** `nexus eval conv add-user` */
export function registerEvalConvAddUserCommand(conv: Command, program: Command): Command {
  const leaf = conv
    .command("add-user")
    .description("Append a user turn (you, playing the end user)")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--text <text>", "The user message")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv add-user --conversation-id 33333333-3333-4333-8333-333333333333 \\
      --text "I want a refund"

Notes:
  ADDING A USER TURN DISCARDS ANY PENDING CANDIDATE — the candidate answered
  the previous user message, so accepting it after this would store a reply
  to the wrong question. Generate again after adding.`
    )
    .action(async (opts: { conversationId: string; text: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.addUserTurn(opts.conversationId, {
          text: opts.text
        });
        printEnvelope(result, () => {
          console.log(`you › ${result.content}  (turn ${result.index})`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, GOLDEN_CONVERSATION_ADD_USER_TURN_CONTRACT);
  return leaf;
}
