import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError, reportFailure } from "../../../errors";
import { printEnvelope } from "../../../output";
import { GOLDEN_CONVERSATION_READY_CONTRACT } from "../../eval.contract.generated";

/** `nexus eval conv ready` */
export function registerEvalConvReadyCommand(conv: Command, program: Command): Command {
  const leaf = conv
    .command("ready")
    .description("Mark the conversation READY (authoring done, eligible for runs)")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv ready --conversation-id 33333333-3333-4333-8333-333333333333

Notes:
  READY REQUIRES AT LEAST ONE CHECKPOINT — a conversation with no test case
  in it cannot participate in a run, so this refuses rather than deferring
  the surprise to run creation.
  READY IS NOT A LOCK: turns stay editable and checkpoints toggleable after.
  Marking an already-READY conversation ready again is a no-op, not an error.`
    )
    .action(async (opts: { conversationId: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.ready(opts.conversationId);
        // "ready" is a check-shaped verb, so its verdict rides the EXIT CODE
        // (status-verdict gate; `external-tool test-auth` is the worked
        // example). The server refuses with 4xx on every real failure, so this
        // arm is a contract check — but a script gating on this command gates
        // on the answer, not on prose.
        if (result.status !== "READY") {
          process.exitCode = reportFailure(
            "remote-error",
            `Conversation is ${result.status}, not READY.`,
            'The server accepted the request but the conversation did not reach READY. Inspect it with "eval conv get".'
          );
          return;
        }
        printEnvelope(result, () => {
          console.log(`${result.title} is ready for eval runs`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, GOLDEN_CONVERSATION_READY_CONTRACT);
  return leaf;
}
