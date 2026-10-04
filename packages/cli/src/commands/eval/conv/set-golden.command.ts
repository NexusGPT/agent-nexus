import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope } from "../../../output";
import { GOLDEN_CONVERSATION_SET_TURN_CONTENT_CONTRACT } from "../../eval.contract.generated";
import { readFileArg } from "../_shared/read-file-arg";

/** `nexus eval conv set-golden` */
export function registerEvalConvSetGoldenCommand(conv: Command, program: Command): Command {
  const leaf = conv
    .command("set-golden")
    .description("Replace an existing agent turn's golden content")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--index <n>", "0-based turn index", parseInt)
    .requiredOption("--file <path>", "File whose content becomes the golden reply")
    .addHelpText(
      "after",
      `
Examples:
  $ echo "Refunds take 3-5 business days." > fix.md
  $ nexus eval conv set-golden --conversation-id 33333333-3333-4333-8333-333333333333 \\
      --index 3 --file fix.md

Notes:
  AGENT TURNS ONLY — a user turn is your own words and cannot be "golden".
  EDITING NEVER INVALIDATES PAST RUNS: a run snapshots the golden content it
  judged against, so this changes future runs only. The turn is flagged
  edited: true.`
    )
    .action(async (opts: { conversationId: string; index: number; file: string }) => {
      try {
        const content = readFileArg(opts.file);
        if (content === undefined) return;
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.setTurnContent(
          opts.conversationId,
          opts.index,
          { content }
        );
        printEnvelope(result, () => {
          console.log(`turn ${result.index} updated (edited): ${result.content}`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, GOLDEN_CONVERSATION_SET_TURN_CONTENT_CONTRACT, {
    "Body.content": "supplied via --file <path>; the CLI reads the file and sends its content"
  });
  return leaf;
}
