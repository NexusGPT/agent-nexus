import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { color, printEnvelope } from "../../../output";
import { GOLDEN_CONVERSATION_GET_CONTRACT } from "../../eval.contract.generated";

/** `nexus eval conv get` */
export function registerEvalConvGetCommand(conv: Command, program: Command): Command {
  const leaf = conv
    .command("get")
    .description("Show a conversation with its full turn list")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv get --conversation-id 33333333-3333-4333-8333-333333333333
  $ nexus eval conv get --conversation-id 33333333-3333-4333-8333-333333333333 --json

Notes:
  Under --json, .turns is ORDERED BY INDEX (0-based) and each turn carries
  role, content, toolCalls, edited, isCheckpoint, and criteria — the exact
  facts a test run judges against.
  A ✓ in the human view marks checkpoints; (edited) marks hand-edited turns.`
    )
    .action(async (opts: { conversationId: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.get(opts.conversationId);
        printEnvelope(result, () => {
          console.log(`${color.bold(result.title)}  [${result.status}]  ${result.id}`);
          for (const turn of result.turns) {
            const marks = [
              turn.isCheckpoint ? "✓" : " ",
              turn.edited ? "(edited)" : "",
              turn.toolCalls !== null && turn.toolCalls.length > 0
                ? `[tools: ${turn.toolCalls.map((t) => t.name).join(", ")}]`
                : ""
            ]
              .filter(Boolean)
              .join(" ");
            const speaker = turn.role === "USER" ? "you  " : "agent";
            console.log(`${String(turn.index).padStart(2)} ${speaker} › ${turn.content} ${marks}`);
          }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, GOLDEN_CONVERSATION_GET_CONTRACT);
  return leaf;
}
