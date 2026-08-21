import type {
  ChatSession,
  ChatStreamChunk,
  CreateChatSessionBody,
  NexusClient,
  SendChatMessageBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError, refuse, reportFailure } from "../errors";
import { color, emitDocument, isJsonMode, printRecord } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { resolveInputValue } from "../util/stdin";
import {
  CHAT_RESUME_STREAM_CONTRACT,
  CHAT_SEND_MESSAGE_STREAM_CONTRACT,
  CHAT_STOP_TURN_CONTRACT,
  CHAT_TURN_STATUS_CONTRACT,
  DEPLOYMENT_CHAT_SESSION_CREATE_CONTRACT
} from "./chat.contract.generated";

/**
 * `nexus chat` — the headless chat surface, driven from a terminal.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TWO HOPS, AND THIS COMMAND PERFORMS BOTH SO THE SHAPE IS VISIBLE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `chat send` mints a session with the org API key and then streams the turn
 * with the SESSION TOKEN — never with the API key. That is the customer's own
 * architecture executed in one command: hop one belongs on their server, hop two
 * is what their browser does. Anyone reading `--help` sees the split, and
 * `chat session` exists so the first hop can be run on its own and the token
 * handed to a browser or to `curl`.
 *
 * 🔴 THE SECOND HOP CARRIES NO API KEY, AND THAT IS NOT AN OPTIMISATION. The
 * server tries the api-key credential first and short-circuits on it, so a
 * request carrying both is refused 401 with a message that reads like an expired
 * token. The SDK enforces the exclusivity; this command could not send both if
 * it tried.
 */

/**
 * The refusal every control verb shares when the conversation is not named.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 WHY MINTING WITHOUT `--chat-id` IS REFUSED RATHER THAN DEFAULTED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The conversation a control verb addresses is the session token's own claim,
 * and a mint with no `chatId` RESERVES A FRESH ONE. So a defaulted mint would
 * produce a token naming a conversation that has never had a turn, and all
 * three verbs would answer perfectly: `status` reports every field null, `stop`
 * reports `accepted:false`, `resume` streams nothing. Every one of those is a
 * truthful answer about the wrong conversation, and none of them looks like a
 * mistake.
 *
 * A refusal at the edge is the only outcome a script can tell from a real one.
 */
const NO_CONVERSATION_MESSAGE =
  "This command needs the conversation it is about: pass --session-token or --chat-id.";

const NO_CONVERSATION_HINT =
  "Minting without --chat-id reserves a NEW conversation, so every answer would be truthful " +
  "about a conversation that has never had a turn.";

/**
 * A session for a control verb — supplied, or minted for a NAMED conversation.
 *
 * @returns `null` when neither was given. The CALLER refuses, for the same
 * reason `renderTurn` returns its failure: `refuse` has to appear in the action
 * itself, where `json-error-document.static-scan` can see the exit code and the
 * document emitted together. A helper that returned an already-emitted code
 * hides the emitter from the one check that reads for it.
 */
async function resolveControlSession(
  client: NexusClient,
  deploymentId: string,
  opts: { sessionToken?: string; chatId?: string }
): Promise<ChatSession | null> {
  if (typeof opts.sessionToken === "string") {
    // A supplied token is a session this command did not mint, so its
    // conversation and expiry are not ours to report. The placeholders are
    // labelled rather than invented.
    return {
      token: opts.sessionToken,
      sessionId: "(supplied)",
      chatId: "(supplied)",
      expiresInSeconds: 0
    };
  }

  if (typeof opts.chatId !== "string") return null;

  return client.chat.createSession(deploymentId, { chatId: opts.chatId });
}

/**
 * Where the SDK writes each frame's resume cursor as the turn streams.
 *
 * `null` until the first frame carrying an `id:` arrives — and it stays `null`
 * for a frame the server SYNTHESISED, which is the design rather than a gap: a
 * resumed stream re-announces the block the cursor landed inside without
 * recording a new event, so that frame must not move the reader's position.
 */
interface StreamCursor {
  lastEventId: string | null;
}

/**
 * Renders a live turn.
 *
 * Two output modes, and the split is the root epilogue's promise rather than a
 * preference: `--json` must print ONE document on stdout, so the frames are
 * collected and emitted when the turn ends. Without it the point is to WATCH, so
 * text deltas go out as they arrive and everything else is a labelled line
 * around them.
 *
 * `process.stdout.write`, not `console.log`, for the deltas: a delta is a
 * fragment of a sentence and a newline per fragment would print the answer one
 * word per line.
 *
 * @returns what went wrong, or `null` when the turn finished normally. The
 * CALLER reports it: a failure has to reach `reportFailure`, which is the one
 * funnel that emits an error document instead of prose on stderr, and a helper
 * that both printed the prose AND set the exit code would be the exact shape
 * `json-error-document.static-scan` exists to refuse.
 *
 * @param cursor - filled by the SDK as frames arrive, read here once the turn
 *   ends. A box rather than a return value because the caller has to hand the
 *   same sink to `chat.stream` before this function is called.
 */
async function renderTurn(
  session: ChatSession,
  chunks: AsyncIterable<ChatStreamChunk>,
  cursor: StreamCursor
): Promise<{ message: string } | null> {
  const collected: ChatStreamChunk[] = [];
  const json = isJsonMode();
  let failure: { message: string } | null = null;

  /**
   * Which kind of delta the cursor is currently mid-line on.
   *
   * Both reasoning and text arrive as fragments written WITHOUT a newline, which
   * makes them indistinguishable if they share a line — and a model that reasons
   * between tool calls interleaves them constantly. Tracking the RUN is what
   * lets a switch break the line and label the new one; a plain boolean could
   * only say "something was written".
   */
  let openLine: "reasoning" | "text" | null = null;

  const closeLine = () => {
    if (openLine !== null) process.stdout.write("\n");
    openLine = null;
  };

  const writeDelta = (kind: "reasoning" | "text", delta: string) => {
    if (openLine !== kind) {
      closeLine();
      if (kind === "reasoning") process.stdout.write(color.dim("thinking  "));
      openLine = kind;
    }
    process.stdout.write(kind === "reasoning" ? color.dim(delta) : delta);
  };

  if (!json) {
    console.log(color.dim(`conversation ${session.chatId} · session ${session.sessionId}`));
  }

  for await (const chunk of chunks) {
    if (json) {
      collected.push(chunk);
      // The failure arms still have to be RECORDED, even when nothing is
      // printed as it happens — a turn that errored must not exit 0 under
      // --json just because the document was emitted successfully.
      if (chunk.type === "error") failure = { message: chunk.errorText };
      if (chunk.type === "finish" && chunk.finishReason === "error") {
        failure ??= { message: "The agent turn ended in an error." };
      }
      continue;
    }

    switch (chunk.type) {
      case "text-delta":
        writeDelta("text", chunk.delta);
        break;
      case "reasoning-delta":
        writeDelta("reasoning", chunk.delta);
        break;
      case "tool-input-start":
        closeLine();
        console.log(color.dim(`  → ${chunk.toolName}`));
        break;
      case "tool-output-available":
        closeLine();
        console.log(color.dim(`  ✓ tool ${chunk.toolCallId}`));
        break;
      case "tool-output-error":
        closeLine();
        console.error(color.red(`  ✗ tool ${chunk.toolCallId}: ${chunk.errorText}`));
        break;
      case "error":
        // TERMINAL for the message: a conformant client stops reading after
        // this, so anything the server sends afterwards is not read. Recorded
        // rather than printed here, so the caller reports it through the error
        // funnel and a `--json` run still gets a document.
        closeLine();
        failure = { message: chunk.errorText };
        break;
      case "finish":
        closeLine();
        if (chunk.finishReason !== undefined) {
          console.log(color.dim(`[${chunk.finishReason}]`));
          if (chunk.finishReason === "error") {
            failure ??= { message: "The agent turn ended in an error." };
          }
        }
        break;
      default:
        // Every other member of the union is either unproduced today or carries
        // nothing a terminal can usefully render. Silently ignored rather than
        // printed as noise — `--json` is where the whole frame set lives.
        break;
    }
  }

  closeLine();

  if (json) {
    emitDocument({
      session: {
        chatId: session.chatId,
        sessionId: session.sessionId,
        expiresInSeconds: session.expiresInSeconds
      },
      // The cursor of the last frame RECEIVED HERE — never what the server has
      // recorded since. That distinction is the whole of "resume": reattaching
      // from a position ahead of what you rendered drops the text in between.
      lastEventId: cursor.lastEventId,
      chunks: collected
    });
  } else if (cursor.lastEventId !== null) {
    console.log(color.dim(`last-event-id ${cursor.lastEventId}`));
  }

  return failure;
}

export function registerChatCommands(program: Command): void {
  const chat = program
    .command("chat")
    .description("Talk to a deployment's agent over the headless chat API");

  chat.addHelpText(
    "after",
    `
The browser chat surface, in two hops:

  1. A SERVER mints a short-lived, deployment-scoped session token with the
     organization API key ("nexus chat session").
  2. A BROWSER holds that token and streams turns with it. The API key never
     reaches the browser.

"nexus chat send" performs both, so one command demonstrates the whole shape.
The stream is the Vercel AI SDK 7 UI Message Stream format, which is what makes
a stock useChat() work against this API with no configuration.

  nexus chat session <deployment-id>        →  mint a token for a browser
  nexus chat send <deployment-id> -m "..."  →  mint + stream one turn

A turn is not only started. These three are the rest of a real chat client, and
each takes the SAME session token, so a browser can reach all of them:

  nexus chat stop <deployment-id>           →  the Stop button
  nexus chat status <deployment-id>         →  is a turn still running
  nexus chat resume <deployment-id>         →  reattach after a drop or a reload

Each needs the conversation named, by --session-token or by --chat-id. Stopping
reports that the stop was ACCEPTED, never that it has taken effect; "status" is
where "outcome": "stopped" appears.`
  );

  // ═══════════════════════════════════════════════════════════════════════
  // session — hop one on its own
  // ═══════════════════════════════════════════════════════════════════════
  const session = chat
    .command("session")
    .description("Mint a chat-session token a browser may hold")
    .argument("<deployment-id>", "Deployment ID (must be an EMBED or API channel)")
    .option("--chat-id <uuid>", "Resume an existing conversation instead of starting a new one")
    .option("--external-user-id <id>", "Your own id for this visitor")
    .option(
      "--identity-hash <hex>",
      "HMAC-SHA256 of --external-user-id under the deployment's embed identity secret"
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus chat session 44444444-4444-4444-8444-444444444444
  $ nexus chat session 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333
  $ nexus chat session 44444444-4444-4444-8444-444444444444 --external-user-id user-42 --identity-hash a1b2... --json

Notes:
  THE TOKEN IS THE CREDENTIAL A BROWSER HOLDS. Print it, hand it to your web
  app, and let the browser stream with it. Your organization API key must never
  reach a browser; that is the entire reason this route exists.
  WITH NO --chat-id THIS WRITES NOTHING. The conversation id in the response is
  RESERVED, and the conversation row is created by the first message. So minting
  a token you never use costs nothing and leaves no record.
  THE DEPLOYMENT MUST BE AN "EMBED" OR "API" CHANNEL. Any other type is refused.
  A 503 means the environment has no chat-session signing secret configured. It
  is not a bad request and retrying will not clear it.
  --chat-id must name a conversation belonging to THIS organization AND THIS
  deployment. Anything else is a 404 — the same answer an id that does not exist
  gets, deliberately, so the refusal is no existence oracle.
  expiresInSeconds is the bearer lifetime. Treat ANY 401 from "chat send" as
  "this credential is finished" and mint a new one.`
    )
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          chatId: opts.chatId,
          externalUserId: opts.externalUserId,
          identityHash: opts.identityHash
        });

        const session = await client.chat.createSession(
          deploymentId,
          asRequestBody<CreateChatSessionBody>(body)
        );
        printRecord(session);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // send — both hops, rendered live
  // ═══════════════════════════════════════════════════════════════════════
  const send = chat
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
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const content =
          typeof opts.message === "string" ? await resolveInputValue(opts.message) : undefined;

        const body = asRequestBody<SendChatMessageBody>(
          mergeBodyWithFlags(base, {
            content,
            knowledgeIds: opts.knowledgeId,
            images: opts.image
          })
        );

        // A supplied token is a session this command did not mint, so its
        // conversation and expiry are not ours to report. The placeholders are
        // labelled rather than invented: printing a chatId we never received
        // would be a value a script could believe.
        const session: ChatSession =
          typeof opts.sessionToken === "string"
            ? {
                token: opts.sessionToken,
                sessionId: "(supplied)",
                chatId: "(supplied)",
                expiresInSeconds: 0
              }
            : await client.chat.createSession(deploymentId, {
                chatId: opts.chatId,
                externalUserId: opts.externalUserId,
                identityHash: opts.identityHash
              });

        const cursor: StreamCursor = { lastEventId: null };
        const failure = await renderTurn(
          session,
          client.chat.stream(
            deploymentId,
            body,
            { token: session.token },
            {
              onEventId: (eventId) => {
                cursor.lastEventId = eventId;
              }
            }
          ),
          cursor
        );
        if (failure !== null) {
          // `reportFailure`, never `console.error` + a hand-set code: it is the
          // funnel that puts an error DOCUMENT on stdout under `--json`, and it
          // decides the exit code from the cause rather than inventing one.
          process.exitCode = reportFailure(
            "remote-error",
            failure.message,
            "The stream opened and the turn itself failed. Read the frames with --json."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // stop — the Stop button
  // ═══════════════════════════════════════════════════════════════════════
  const stop = chat
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

  // ═══════════════════════════════════════════════════════════════════════
  // status — what is happening on the conversation right now
  // ═══════════════════════════════════════════════════════════════════════
  const status = chat
    .command("status")
    .description("Read the state of a conversation's newest agent turn")
    .argument("<deployment-id>", "Deployment ID (must be an EMBED or API channel)")
    .option("--session-token <token>", "The session token naming the conversation")
    .option("--chat-id <uuid>", "Mint a session for this EXISTING conversation instead")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus chat status 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333
  $ nexus chat status 44444444-4444-4444-8444-444444444444 --session-token "$TOKEN"
  $ nexus chat status 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333 --json

Notes:
  READ FROM THE DURABLE LOG, NOT FROM A POD. Every replica answers the same. A
  reading taken from the process holding the generation would report "nothing is
  running" on every other pod for a turn that is running.
  "running": true IS A STATEMENT ABOUT THE RECORD, not a heartbeat. A turn whose
  pod died before it could settle reads true for ever, and nothing on this
  surface can tell that from a turn still thinking.
  outcome IS "completed", "failed" OR "stopped", and null while it runs. It is
  the only place "the visitor pressed Stop" is spelled out — the stream's own
  finish frame says "other" for a stopped turn.
  lastEventId IS THE CURSOR THE SERVER HAS, not the one you have. Resuming from
  it after a dropped connection skips every frame written in between. Resume
  from the last-event-id "nexus chat send" or "nexus chat resume" printed.
  A CONVERSATION WITH NO TURN answers every field null with frameCount 0. That
  is the correct answer, not an error.
  A FAILED TURN IS REPORTED AS A FAILURE and this command exits non-zero, the
  same way "nexus chat send" reports one. outcome "stopped" and outcome
  "completed" both exit zero — a turn that stopped because somebody stopped it
  did what was asked, so a script can run "chat stop" and then this one.
  ONE OF --session-token OR --chat-id IS REQUIRED. Minting without a chat id
  reserves a NEW conversation, which always reads as empty.
  --chat-id NAMES A CONVERSATION THAT EXISTS, and the id "nexus chat session"
  prints is NOT one until a message has been sent: that id is RESERVED and no
  row is written, so minting against it answers 404 "Chat not found". For a
  brand-new conversation, keep the token and pass --session-token instead.`
    )
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

  // ═══════════════════════════════════════════════════════════════════════
  // resume — reattach to a turn already in flight
  // ═══════════════════════════════════════════════════════════════════════
  const resume = chat
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

  // Bound LAST, after every option exists — see `bindCommand`. One descriptor
  // per leaf, one per HOP.
  bindCommand(session, DEPLOYMENT_CHAT_SESSION_CREATE_CONTRACT);
  bindCommand(send, CHAT_SEND_MESSAGE_STREAM_CONTRACT);
  bindCommand(stop, CHAT_STOP_TURN_CONTRACT);
  bindCommand(status, CHAT_TURN_STATUS_CONTRACT);
  bindCommand(resume, CHAT_RESUME_STREAM_CONTRACT);
}
