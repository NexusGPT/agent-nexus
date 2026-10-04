import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope } from "../../../output";
import { GOLDEN_CONVERSATION_ACCEPT_CONTRACT } from "../../eval.contract.generated";
import { readFileArg } from "../_shared/read-file-arg";

/** `nexus eval conv accept` */
export function registerEvalConvAcceptCommand(conv: Command, program: Command): Command {
  const leaf = conv
    .command("accept")
    .description("Accept the pending candidate as the golden agent turn")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .option(
      "--file <path>",
      "Accept-with-edit: store this file's content instead (flags the turn edited)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv accept --conversation-id 33333333-3333-4333-8333-333333333333
  $ nexus eval conv accept --conversation-id 33333333-3333-4333-8333-333333333333 --file edited.md

Notes:
  WITHOUT --file the candidate is stored verbatim (edited: false). With
  --file YOUR text becomes the golden content and the turn is flagged
  edited: true — the recorded tool calls stay the candidate's, because you
  edited the words, not what the agent did.
  CHECKPOINT DEFAULTS ON for every accepted agent turn; toggle off with
  "nexus eval conv checkpoint --off".
  With no pending candidate (never generated, or discarded by add-user)
  this refuses — run generate first.`
    )
    .action(async (opts: { conversationId: string; file?: string }) => {
      try {
        let content: string | undefined;
        if (opts.file !== undefined) {
          content = readFileArg(opts.file);
          if (content === undefined) return;
        }
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.accept(
          opts.conversationId,
          content !== undefined ? { content } : undefined
        );
        printEnvelope(result, () => {
          const suffix = result.edited ? " (edited)" : "";
          console.log(`accepted turn ${result.index}${suffix}: ${result.content}`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, GOLDEN_CONVERSATION_ACCEPT_CONTRACT, {
    "Body.content": "supplied via --file <path>; the CLI reads the file and sends its content"
  });
  return leaf;
}
