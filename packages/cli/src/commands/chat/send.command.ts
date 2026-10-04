import type { Command } from "commander";

import { type ChatSendOptions, runChatSend } from "./send.handler";

/** `nexus chat send` — both hops, rendered live. */
export function registerChatSendCommand(chat: Command, program: Command): Command {
  return chat
    .command("send")
    .description("Send one message and stream the agent's turn as it happens")
    .argument("<deployment-id>", "Deployment ID (must be an EMBED or API channel)")
    .option("-m, --message <text-or->", "The message to send, or '-' to read stdin")
    .option(
      "--session-token <token>",
      "Stream with an EXISTING session token instead of minting a new one"
    )
    .option("--chat-id <uuid>", "Resume an existing conversation (used when minting)")
    .option("--external-user-id <id>", "Your own id for this visitor (used when minting)")
    .option("--identity-hash <hex>", "Identity verification hash (used when minting)")
    .option("--knowledge-id <uuid...>", "Knowledge document to attach to this turn (repeatable)")
    .option("--image <url...>", "Image URL to attach to this turn (repeatable)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus chat send 44444444-4444-4444-8444-444444444444 -m "What are your opening hours?"
  $ echo "summarise the last invoice" | nexus chat send 44444444-4444-4444-8444-444444444444 -m -
  $ nexus chat send 44444444-4444-4444-8444-444444444444 -m "hi" --chat-id 33333333-3333-4333-8333-333333333333
  $ nexus chat send 44444444-4444-4444-8444-444444444444 -m "hi" --session-token "$TOKEN"
  $ nexus chat send 44444444-4444-4444-8444-444444444444 -m "hi" --json

Notes:
  THIS RUNS THE REAL AGENT: real tools, real side effects, real cost. It is the
  same door the embedded widget uses, not the emulator.
  TWO HOPS, ONE COMMAND. Without --session-token this mints a session with your
  API key and then streams with the TOKEN. The streaming request carries no API
  key at all — the server refuses one that carries both, with a 401 whose message
  reads like an expired token.
  THE REPLY IS THE OUTPUT. Text arrives delta by delta as the model produces it;
  there is no second call and no "processing" handoff.
  --session-token REUSES a session, so successive sends continue ONE
  conversation. Without it every send mints a fresh session, and with no
  --chat-id that means a NEW conversation each time.
  THE CONVERSATION IS NAMED BY THE TOKEN, never by the body. Move it with
  --chat-id at mint time; there is no body field that can.
  UNDER --json ONE DOCUMENT IS PRINTED WHEN THE TURN ENDS: {"session":{...},
  "chunks":[...]} holding every frame in order. Nothing streams to stdout in that
  mode, because a stream of documents is not a document.
  A FAILED TURN EXITS NON-ZERO. An "error" frame, or a finish carrying
  finishReason "error", is reported as a failure — the stream opening
  successfully says nothing about whether the turn worked.
  NOT EVERY FRAME IS RENDERED. Text, reasoning, tool start/finish and the finish
  reason are; the rest of the 28-member union is either unproduced today or
  carries nothing a terminal can show. --json has all of them.`
    )
    .action(async (deploymentId: string, opts: ChatSendOptions) => {
      await runChatSend(program, deploymentId, opts);
    });
}
