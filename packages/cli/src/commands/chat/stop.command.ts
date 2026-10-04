import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { printRecord } from "../../output";
import { NO_CONVERSATION_HINT, NO_CONVERSATION_MESSAGE } from "./_shared/no-conversation";
import { resolveControlSession } from "./_shared/resolve-control-session";

/** `nexus chat stop` — the Stop button. */
export function registerChatStopCommand(chat: Command, program: Command): Command {
  return chat
    .command("stop")
    .description("Stop the agent turn running on a conversation")
    .argument("<deployment-id>", "Deployment ID (must be an EMBED or API channel)")
    .option("--session-token <token>", "The session token naming the conversation")
    .option("--chat-id <uuid>", "Mint a session for this EXISTING conversation instead")
    .option("--turn-id <id>", "Stop this turn specifically, instead of the newest unsettled one")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus chat stop 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333
  $ nexus chat stop 44444444-4444-4444-8444-444444444444 --session-token "$TOKEN"
  $ nexus chat stop 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333 --json

Notes:
  ACCEPTED IS NOT STOPPED. "accepted": true says a live turn was found to fire
  at, never that it has already stopped. The abort reaches the pod running the
  generation through a fire-and-forget publish, so nothing this request can
  compute knows whether it landed.
  READ "nexus chat status" FOR THE FACT. outcome "stopped" is the record that
  the turn ended because somebody stopped it. Measured against staging: status
  read 0.6 s after an accepted stop still said running true with the same frame
  count, and settled to outcome "stopped" four frames later.
  THE WIRE SHAPE OF A STOP VARIES BY PROVIDER. Two staging deployments in one
  session ended differently: one abort then finish, the other an error frame
  carrying an upstream 500. outcome "stopped" was the same on both, which is
  why it is the reading to branch on and the frames are not.
  "accepted": false IS NOT AN ERROR and exits 0. It means nothing was running:
  the turn had already finished, or none had started.
  NOTHING IS DELETED. The turn keeps its messages, its billing and its place in
  the conversation. It stops generating.
  PASS --turn-id WHEN YOU HAVE ONE. Read it from "nexus chat status". A stop
  that races a turn ending cannot then reach the turn that started after you
  last looked.
  ONE OF --session-token OR --chat-id IS REQUIRED. Minting without a chat id
  reserves a NEW conversation, so the command would answer truthfully about a
  conversation that has never had a turn.
  --chat-id NAMES A CONVERSATION THAT EXISTS, and the id "nexus chat session"
  prints is NOT one until a message has been sent: that id is RESERVED and no
  row is written, so minting against it answers 404 "Chat not found". For a
  brand-new conversation, keep the token from "nexus chat session" and pass
  --session-token to send and to all three of these.`
    )
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const chatSession = await resolveControlSession(client, deploymentId, opts);
        if (chatSession === null) {
          process.exitCode = refuse(NO_CONVERSATION_MESSAGE, NO_CONVERSATION_HINT);
          return;
        }

        const result = await client.chat.stop(
          deploymentId,
          typeof opts.turnId === "string" ? { turnId: opts.turnId } : {},
          { token: chatSession.token }
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
