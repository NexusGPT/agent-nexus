import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse, reportFailure } from "../../errors";
import { printRecord } from "../../output";
import { NO_CONVERSATION_HINT, NO_CONVERSATION_MESSAGE } from "./_shared/no-conversation";
import { resolveControlSession } from "./_shared/resolve-control-session";
import { CHAT_STATUS_HELP } from "./status.help";

/** `nexus chat status` — what is happening on the conversation right now. */
export function registerChatStatusCommand(chat: Command, program: Command): Command {
  return chat
    .command("status")
    .description("Read the state of a conversation's newest agent turn")
    .argument("<deployment-id>", "Deployment ID (must be an EMBED or API channel)")
    .option("--session-token <token>", "The session token naming the conversation")
    .option("--chat-id <uuid>", "Mint a session for this EXISTING conversation instead")
    .addHelpText("after", CHAT_STATUS_HELP)
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const chatSession = await resolveControlSession(client, deploymentId, opts);
        if (chatSession === null) {
          process.exitCode = refuse(NO_CONVERSATION_MESSAGE, NO_CONVERSATION_HINT);
          return;
        }

        const turn = await client.chat.status(deploymentId, { token: chatSession.token });

        // 🔴 A CHECK-SHAPED VERB CARRIES ITS ANSWER IN ITS EXIT CODE, and here
        // the answer is `outcome`. `status-verdict.scan.ts` found this leaf the
        // day it was written and it was right to: a script that runs a turn and
        // then asks how it went was gating on nothing.
        //
        // `failed` is the ONLY non-zero arm, and the other two are deliberate.
        // `completed` is the good case; `stopped` is a turn that ended because
        // somebody asked it to, so a `chat stop` followed by this must be able
        // to exit 0 — reporting a successful stop as a failure would make the
        // Stop button unscriptable. `running` and a conversation with no turn
        // are states, not verdicts.
        //
        // `chat send` already reports a failed turn through the same funnel, so
        // this is the namespace answering one way rather than two.
        if (turn.outcome === "failed") {
          // The record is NOT printed first: under `--json` a failure is the
          // error document and nothing else, so everything a caller still needs
          // — the turn and its cursor — travels inside it.
          process.exitCode = reportFailure(
            "remote-error",
            `The newest turn on this conversation failed. turnId=${turn.turnId ?? "unknown"}`,
            `Replay it with "nexus chat resume" to read the error frame. ` +
              `Its last cursor was ${turn.lastEventId ?? "none"} over ${turn.frameCount} frame(s).`
          );
          return;
        }

        printRecord(turn);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
