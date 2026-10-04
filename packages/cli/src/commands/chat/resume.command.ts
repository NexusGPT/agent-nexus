import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse, reportFailure } from "../../errors";
import { NO_CONVERSATION_HINT, NO_CONVERSATION_MESSAGE } from "./_shared/no-conversation";
import { renderTurn } from "./_shared/render-turn";
import { resolveControlSession } from "./_shared/resolve-control-session";
import type { StreamCursor } from "./_shared/stream-cursor";

/** `nexus chat resume` — reattach to a turn already in flight. */
export function registerChatResumeCommand(chat: Command, program: Command): Command {
  return chat
    .command("resume")
    .description("Reattach to a conversation's newest turn and stream what is left")
    .argument("<deployment-id>", "Deployment ID (must be an EMBED or API channel)")
    .option("--session-token <token>", "The session token naming the conversation")
    .option("--chat-id <uuid>", "Mint a session for this EXISTING conversation instead")
    .option("--last-event-id <id>", "Replay from AFTER this frame instead of from the start")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus chat resume 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333
  $ nexus chat resume 44444444-4444-4444-8444-444444444444 --session-token "$TOKEN" --last-event-id 7ba1c0de-0000-4000-8000-000000000000:13
  $ nexus chat resume 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333 --json

Notes:
  THE CURSOR IS EXCLUSIVE. --last-event-id 7ba1c0de-...:13 replays from :14, so
  the text joins with no overlap and no gap.
  WITHOUT --last-event-id THE WHOLE TURN REPLAYS, which is what a page that
  reloaded and holds nothing wants — and wrong for a client that only lost its
  socket, because text accumulates by APPENDING and the answer would be printed
  twice.
  THE FIRST FRAME REOPENS A BLOCK YOU ARE ALREADY INSIDE. A cursor lands
  mid-block, so the server synthesises the opener with the SAME block id and no
  id line of its own. It carries no cursor because it is not a log entry.
  THE CURSOR IS PRINTED WHEN THE STREAM ENDS, as "last-event-id ...", or as the
  lastEventId field under --json. That is the value to pass back here.
  A FINISHED TURN REPLAYS AND ENDS. Resume is a read; it starts nothing and
  costs no model call.
  ONE OF --session-token OR --chat-id IS REQUIRED. Minting without a chat id
  reserves a NEW conversation, which has nothing to replay.
  --chat-id NAMES A CONVERSATION THAT EXISTS, and the id "nexus chat session"
  prints is NOT one until a message has been sent: that id is RESERVED and no
  row is written, so minting against it answers 404 "Chat not found". For a
  brand-new conversation, keep the token and pass --session-token instead.
  A TURN THAT ENDED IN AN ERROR REPLAYS ITS ERROR FRAME, so replaying one exits
  non-zero. That is the turn's own outcome, not a failure of the replay.`
    )
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const chatSession = await resolveControlSession(client, deploymentId, opts);
        if (chatSession === null) {
          process.exitCode = refuse(NO_CONVERSATION_MESSAGE, NO_CONVERSATION_HINT);
          return;
        }

        const cursor: StreamCursor = { lastEventId: null };
        const failure = await renderTurn(
          chatSession,
          client.chat.resume(
            deploymentId,
            { token: chatSession.token },
            {
              ...(typeof opts.lastEventId === "string" && { lastEventId: opts.lastEventId }),
              onEventId: (eventId) => {
                cursor.lastEventId = eventId;
              }
            }
          ),
          cursor
        );
        if (failure !== null) {
          process.exitCode = reportFailure(
            "remote-error",
            failure.message,
            "The replay reached an error frame. Read the frames with --json."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
