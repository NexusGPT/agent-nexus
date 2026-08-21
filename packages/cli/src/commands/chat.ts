import type {
  ChatSession,
  ChatStreamChunk,
  CreateChatSessionBody,
  SendChatMessageBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError, reportFailure } from "../errors";
import { color, emitDocument, isJsonMode, printRecord } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { resolveInputValue } from "../util/stdin";
import {
  CHAT_SEND_MESSAGE_STREAM_CONTRACT,
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
 */
async function renderTurn(
  session: ChatSession,
  chunks: AsyncIterable<ChatStreamChunk>
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
      chunks: collected
    });
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

  nexus chat session <deployment-id>       →  mint a token for a browser
  nexus chat send <deployment-id> -m "..."  →  mint + stream one turn`
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

        const failure = await renderTurn(
          session,
          client.chat.stream(deploymentId, body, { token: session.token })
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

  // Bound LAST, after every option exists — see `bindCommand`. One descriptor
  // per leaf, one per HOP.
  bindCommand(session, DEPLOYMENT_CHAT_SESSION_CREATE_CONTRACT);
  bindCommand(send, CHAT_SEND_MESSAGE_STREAM_CONTRACT);
}
