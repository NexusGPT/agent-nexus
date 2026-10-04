import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { GOLDEN_CONVERSATION_DELETE_CONTRACT } from "../../eval.contract.generated";

/** `nexus eval conv delete` */
export function registerEvalConvDeleteCommand(conv: Command, program: Command): Command {
  const leaf = confirmable(
    conv.command("delete").description("Delete a conversation and all its turns")
  )
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv delete --conversation-id 33333333-3333-4333-8333-333333333333 --yes

Notes:
  THE DELETE IS HARD — the conversation and every turn go, and past eval
  runs keep only the snapshots they judged against. Without --yes this asks
  at a terminal and REFUSES in a script.`
    )
    .action(async (opts: { conversationId: string; yes?: boolean }) => {
      try {
        if (
          !(await confirmDestructive(
            `Delete golden conversation ${opts.conversationId} and all its turns?`,
            opts
          ))
        ) {
          return;
        }
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.delete(opts.conversationId);
        printEnvelope(result, () => {
          console.log(`Deleted ${opts.conversationId}`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, GOLDEN_CONVERSATION_DELETE_CONTRACT);
  return leaf;
}
