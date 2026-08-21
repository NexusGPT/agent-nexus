import { UI_MESSAGE_STREAM_PROTOCOL_HEADER } from "../http-client";
import type {
  ChatResumeCursor,
  ChatResumeOptions,
  ChatSession,
  ChatStopResult,
  ChatStreamAuth,
  ChatStreamChunk,
  ChatStreamOptions,
  ChatTurnStatus,
  CreateChatSessionBody,
  SendChatMessageBody,
  StopChatTurnBody
} from "../types/chat";
import { BaseResource } from "./base-resource";

/**
 * The `Last-Event-ID` request header, spelled once.
 *
 * A HEADER rather than a query parameter because that is the name the SSE wire
 * format already gives this value: the frames this surface emits carry an `id:`
 * field, so a client that kept the last one is holding a `Last-Event-ID`
 * without having been told to.
 */
const LAST_EVENT_ID_HEADER = "Last-Event-ID";

/** The `Last-Event-ID` header for a cursor, or no headers at all for none. */
function cursorHeaders(lastEventId: string | undefined): Record<string, string> | undefined {
  return lastEventId === undefined ? undefined : { [LAST_EVENT_ID_HEADER]: lastEventId };
}

/**
 * Chat resource. Accessed via `client.chat`.
 *
 * The headless chat surface: mint a browser credential with the org API key,
 * then stream an agent turn with that credential in the Vercel AI SDK 7 UI
 * Message Stream format.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ONE METHOD TAKES THE API KEY. THE OTHER FIVE TAKE THE SESSION TOKEN.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * {@link createSession} authenticates with the org API key this client was
 * constructed with — it is a privileged act and belongs on a server.
 * {@link stream}, {@link streamRaw}, {@link resume}, {@link resumeRaw},
 * {@link stop} and {@link status} authenticate with the SESSION TOKEN and send
 * NO api-key at all, because the server refuses a request that carries both.
 * That asymmetry is the security property, not an inconvenience: the token
 * names one deployment and one conversation, and holds no scopes.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE CONTROL SURFACE — what turns a demo into a product
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A turn is not only started. It is stopped, dropped, and picked back up.
 *
 * | want | call |
 * |---|---|
 * | send a message | {@link stream} · {@link streamRaw} |
 * | a Stop button | {@link stop} |
 * | "is it still running" | {@link status} |
 * | reconnect after a reload or a dropped socket | {@link resume} · {@link resumeRaw} |
 *
 * @example A server minting for a browser
 * ```ts
 * const session = await client.chat.createSession(deploymentId, {
 *   externalUserId: user.id,
 *   identityHash: hmac(user.id)
 * });
 * return Response.json({ token: session.token, chatId: session.chatId });
 * ```
 *
 * @example A terminal rendering the turn as it arrives, keeping its cursor
 * ```ts
 * let cursor: string | undefined;
 * const auth = { token };
 * for await (const chunk of client.chat.stream(
 *   deploymentId,
 *   { content: "hi" },
 *   auth,
 *   { onEventId: (id) => void (cursor = id) }
 * )) {
 *   if (chunk.type === "text-delta") process.stdout.write(chunk.delta);
 * }
 * ```
 *
 * @example Stop, then confirm it landed
 * ```ts
 * await client.chat.stop(deploymentId, {}, auth);
 * // `accepted` says a live turn was found, never that it has stopped.
 * let state = await client.chat.status(deploymentId, auth);
 * while (state.running) {
 *   await new Promise((r) => setTimeout(r, 250));
 *   state = await client.chat.status(deploymentId, auth);
 * }
 * console.log(state.outcome); // "stopped"
 * ```
 *
 * @example Pick the turn back up where the socket died
 * ```ts
 * for await (const chunk of client.chat.resume(deploymentId, auth, {
 *   ...(cursor !== undefined && { lastEventId: cursor }),
 *   onEventId: (id) => void (cursor = id)
 * })) {
 *   if (chunk.type === "text-delta") process.stdout.write(chunk.delta);
 * }
 * ```
 */
export class ChatResource extends BaseResource {
  /**
   * Mint a short-lived, deployment-scoped credential a BROWSER may hold.
   *
   * Uses the ORG API KEY. Needs the `chat_sessions:execute` scope, and the
   * deployment must be an `EMBED` or `API` channel — any other type is refused.
   *
   * With no `chatId` this writes NO row: the conversation id is reserved and the
   * conversation is created by the first message. So a mint is safe to call
   * speculatively.
   *
   * ⚠️ A **503** here means the environment has no chat-session signing secret
   * configured. It is not a bad request and retrying the same call will keep
   * answering 503 until the environment is fixed.
   */
  async createSession(
    deploymentId: string,
    body: CreateChatSessionBody = {}
  ): Promise<ChatSession> {
    return this.http.request<ChatSession>("POST", `/deployments/${deploymentId}/chat-session`, {
      body
    });
  }

  /**
   * Stream one agent turn, yielding each parsed frame as it arrives.
   *
   * The convenient door: `data:` records are split, JSON-parsed and typed as
   * {@link ChatStreamChunk}. The terminating `data: [DONE]` sentinel is not
   * JSON and is skipped, as are the `: keepalive` comment frames the server
   * sends every 15 seconds on a slow turn — so the loop simply ends when the
   * turn does.
   *
   * Leaving the loop early (`break`, `return`, a throw) cancels the connection.
   * The turn keeps running server-side and its result is still persisted to the
   * conversation, so a later read still sees the answer.
   *
   * 🔴 **A 401 means the session is finished, whatever the reason.** Mint a new
   * one with {@link createSession} rather than retrying with the same token.
   *
   * ## Why this does NOT declare `LONG_RUNNING_TIMEOUT_MS`
   *
   * A turn runs a model, so the constant looks like it belongs here. It does
   * not: the per-attempt deadline bounds the WAIT FOR HEADERS ONLY — the timer
   * is cleared the moment `fetch` resolves, which on a stream is before the
   * first frame. On the server the whole model turn happens AFTER the SSE
   * headers are flushed (`stream-chat-message.use-case.ts` resolves the
   * deployment and the conversation, THEN calls `openStream()`, THEN writes the
   * message), so everything this deadline can actually bound is two database
   * reads. Ten minutes of header wait would only mean a dead connection hangs
   * for ten minutes. `emulator.streamMessage` declares nothing for the same
   * reason. A caller who wants longer sets `timeout` on the client.
   *
   * @param deploymentId - The deployment the session token was minted for. It
   *   must match the token's own claim; a mismatch is a 401 that is
   *   byte-identical to a garbage token, so it is no existence oracle.
   * @param body - The turn. A stock `useChat` body works unchanged; a plain
   *   caller sends `{ content }`.
   * @param auth - The session token. See {@link ChatStreamAuth}.
   * @param opts - Pass `onEventId` to keep this turn's resume cursor. Without
   *   it a dropped connection can only be reattached with {@link resume} from
   *   the START of the turn, which re-renders text the caller already has.
   */
  stream(
    deploymentId: string,
    body: SendChatMessageBody,
    auth: ChatStreamAuth,
    opts: ChatStreamOptions = {}
  ): AsyncGenerator<ChatStreamChunk, void, undefined> {
    return this.http.requestSSE<ChatStreamChunk>("POST", `/deployments/${deploymentId}/chat`, {
      body,
      chatSessionToken: auth.token,
      ...(opts.onEventId !== undefined && { onEventId: opts.onEventId })
    });
  }

  /**
   * Reattach to the newest turn of this conversation and stream what is left.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * WHAT A RESUMED STREAM OPENS WITH, AND WHY IT IS NOT A BUG
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A cursor lands wherever the connection died, which is usually INSIDE a text
   * block — between its `text-start` and its `text-end`. A client that has been
   * reloaded holds no block, and the AI SDK's own reader THROWS
   * (`UIMessageStreamError`) on a `text-delta` whose opener it never saw.
   *
   * So the server synthesises an opener for EVERY block still open at the
   * cursor, carrying the SAME block id as the original and NO `id:` line of its
   * own — it re-announces a block rather than recording a new event, so it must
   * not move the reader's cursor. Measured on a turn dropped while both a text
   * and a reasoning block were open: the resumed stream opened `text-start`,
   * `reasoning-start`, and those were the ONLY two of its 20 frames that
   * carried no cursor. Everything after them is the real log, replayed from the
   * frame AFTER the cursor.
   *
   * 🔴 **THE CURSOR IS EXCLUSIVE AND TEXT ACCUMULATES BY APPENDING.** Resuming
   * at `<turn>:13` replays from `<turn>:14`, so the two halves of the answer
   * join with no overlap and no gap. Resuming from a cursor EARLIER than what
   * you rendered duplicates text instead of correcting it, which is why
   * {@link ChatTurnStatus.lastEventId} is the wrong value to reattach with
   * after a drop: it is the newest frame RECORDED, not the newest you received.
   *
   * With no cursor at all the whole turn replays from its first frame — right
   * for a page that reloaded and holds nothing, wrong for a client that only
   * lost its socket.
   *
   * @param deploymentId - The deployment the session token was minted for.
   * @param auth - The session token. The conversation is the token's own claim;
   *   there is no parameter that can name a different one.
   * @param opts - `lastEventId` is the cursor; `onEventId` keeps the next one.
   */
  resume(
    deploymentId: string,
    auth: ChatStreamAuth,
    opts: ChatResumeOptions = {}
  ): AsyncGenerator<ChatStreamChunk, void, undefined> {
    return this.http.requestSSE<ChatStreamChunk>(
      "GET",
      `/deployments/${deploymentId}/chat/stream`,
      {
        chatSessionToken: auth.token,
        ...(cursorHeaders(opts.lastEventId) !== undefined && {
          headers: cursorHeaders(opts.lastEventId)
        }),
        ...(opts.onEventId !== undefined && { onEventId: opts.onEventId })
      }
    );
  }

  /**
   * Reattach to the newest turn and hand back the `Response` ITSELF, unread.
   *
   * The resume half of {@link streamRaw}, and the door `useChat({ resume:
   * true })` needs: the AI SDK issues a GET at the same endpoint it POSTs to,
   * so a customer proxying Nexus forwards this body verbatim from their own
   * `GET` handler exactly as they forward {@link streamRaw} from their `POST`.
   *
   * ```ts
   * // app/api/chat/route.ts
   * export async function GET(req: Request) {
   *   const upstream = await client.chat.resumeRaw(deploymentId, { token }, {
   *     ...(req.headers.get("last-event-id") && {
   *       lastEventId: req.headers.get("last-event-id") as string
   *     })
   *   });
   *   return new Response(upstream.body, { headers: upstream.headers });
   * }
   * ```
   *
   * 🔴 **THE CALLER OWNS THE BODY.** Nothing here reads or cancels it.
   */
  async resumeRaw(
    deploymentId: string,
    auth: ChatStreamAuth,
    opts: ChatResumeCursor = {}
  ): Promise<Response> {
    return this.http.openStream("GET", `/deployments/${deploymentId}/chat/stream`, {
      chatSessionToken: auth.token,
      ...(cursorHeaders(opts.lastEventId) !== undefined && {
        headers: cursorHeaders(opts.lastEventId)
      })
    });
  }

  /**
   * Stop the agent turn running on this conversation.
   *
   * 🔴 **THE RESPONSE REPORTS ACCEPTANCE, NEVER EFFECT, AND THAT IS FORCED BY
   * THE TRANSPORT RATHER THAN CHOSEN.** The abort reaches the pod running the
   * generation through a fire-and-forget publish, so nothing this request can
   * compute knows whether it landed. Measured on the live route: deltas kept
   * arriving for a few hundred milliseconds after the 200 and the terminal
   * frames landed about 1.4 s later.
   *
   * 🔴 **THE WIRE SHAPE OF A STOP IS NOT ONE SHAPE, WHICH IS WHY
   * {@link status} EXISTS.** Measured on two staging deployments in the same
   * session: one ended `abort {"reason":"user-stop"}` → `finish
   * {"finishReason":"other"}`, the other ended `data-nexus-error` → `error`
   * carrying an upstream 500 — the provider surfaced the cancellation as a
   * failure. Even the clean shape's `finishReason: "other"` cannot tell a stop
   * from anything else that ended a turn early.
   *
   * `status().outcome === "stopped"` was identical across both, and it is the
   * only reading that was. Do not branch on the frames.
   *
   * Nothing is deleted: the turn keeps its messages, its billing and its place
   * in the conversation. It stops generating.
   *
   * @param deploymentId - The deployment the session token was minted for.
   * @param body - Optional. Naming `turnId` is strictly safer than omitting it:
   *   a stop that raced a turn ending cannot then reach the turn that started
   *   after the client last looked.
   * @param auth - The session token. The conversation is its own claim.
   */
  async stop(
    deploymentId: string,
    body: StopChatTurnBody,
    auth: ChatStreamAuth
  ): Promise<ChatStopResult> {
    return this.http.request<ChatStopResult>("POST", `/deployments/${deploymentId}/chat/stop`, {
      body,
      chatSessionToken: auth.token
    });
  }

  /**
   * What is happening on this conversation right now.
   *
   * Read from the durable stream log rather than from a pod's in-process
   * execution slot, so every replica answers the same. This is the door for
   * "did my stop land" (`outcome === "stopped"`) and for "is a turn still
   * running" after a page reload.
   *
   * ⚠️ `running: true` is a statement about the RECORD. A turn whose pod died
   * before it could settle reads `true` for ever, and nothing on this surface
   * can tell that from a turn that is genuinely still thinking.
   *
   * @param deploymentId - The deployment the session token was minted for.
   * @param auth - The session token. The conversation is its own claim.
   */
  async status(deploymentId: string, auth: ChatStreamAuth): Promise<ChatTurnStatus> {
    return this.http.request<ChatTurnStatus>("GET", `/deployments/${deploymentId}/chat/status`, {
      chatSessionToken: auth.token
    });
  }

  /**
   * Stream one agent turn and hand back the `Response` ITSELF, unread.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * THIS IS THE `useChat` DOOR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `ai`'s own transport reads the stream, the headers included, and
   * {@link stream} has already thrown the headers away by the time it yields a
   * frame. So a customer proxying Nexus through their own backend — which is
   * what keeps the session token off the browser's own origin — forwards this
   * response body verbatim:
   *
   * ```ts
   * // app/api/chat/route.ts
   * export async function POST(req: Request) {
   *   const upstream = await client.chat.streamRaw(deploymentId, await req.json(), { token });
   *   return new Response(upstream.body, { headers: upstream.headers });
   * }
   * ```
   *
   * and the browser points `useChat({ api: "/api/chat" })` at it with no
   * `prepareSendMessagesRequest` and no custom transport.
   *
   * A non-2xx is still mapped and THROWN, so the caller never has to
   * re-implement the error envelope. A 2xx comes back untouched.
   *
   * 🔴 **THE CALLER OWNS THE BODY.** Nothing here reads or cancels it. Forward
   * it, read it, or cancel it — abandoning it pins a connection.
   */
  async streamRaw(
    deploymentId: string,
    body: SendChatMessageBody,
    auth: ChatStreamAuth
  ): Promise<Response> {
    return this.http.openStream("POST", `/deployments/${deploymentId}/chat`, {
      body,
      chatSessionToken: auth.token
    });
  }

  /**
   * Whether a streaming response announces the UI Message Stream protocol.
   *
   * Read it off a {@link streamRaw} response before forwarding one. A stream
   * missing this header is still readable frame by frame, so its absence is a
   * WARNING rather than a failure — it means something between the pod and this
   * process rewrote the response, and a stock client transport will notice it
   * before a human does.
   */
  static isUiMessageStream(response: Response): boolean {
    return response.headers.get(UI_MESSAGE_STREAM_PROTOCOL_HEADER) !== null;
  }
}
