import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { color, printEnvelope } from "../../../output";
import { GOLDEN_CONVERSATION_GENERATE_CONTRACT } from "../../eval.contract.generated";

/** `nexus eval conv generate` */
export function registerEvalConvGenerateCommand(conv: Command, program: Command): Command {
  const leaf = conv
    .command("generate")
    .description("Generate a candidate reply for the last user message (replay-then-generate)")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv generate --conversation-id 33333333-3333-4333-8333-333333333333 --json

Notes:
  EACH GENERATE IS A FRESH EPHEMERAL EMULATOR SESSION seeded with the golden
  prefix — run it twice and .sessionId differs, which is the no-state-leak
  guarantee regenerate rests on. The reply replaces any previous candidate.
  TOOLS EXECUTE LIVE and the call blocks for the full agent turn — budget
  minutes, not seconds, for tool-heavy agents.
  Under --json, .candidate carries content, toolCalls ([{name,input,output}]),
  latencyMs and tokensUsed; .sessionId names the emulator session (inspect it
  with "nexus emulator session get" while debugging).`
    )
    .action(async (opts: { conversationId: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.generate(opts.conversationId);
        printEnvelope(result, () => {
          console.log(`agent › ${result.candidate.content}`);
          if (result.candidate.toolCalls.length > 0) {
            console.log(
              color.dim(`tools: ${result.candidate.toolCalls.map((t) => t.name).join(", ")}`)
            );
          }
          console.log(color.dim("accept, edit (accept --file), or generate again to redo"));
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, GOLDEN_CONVERSATION_GENERATE_CONTRACT);
  return leaf;
}
