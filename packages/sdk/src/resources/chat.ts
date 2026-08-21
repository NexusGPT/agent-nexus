import { UI_MESSAGE_STREAM_PROTOCOL_HEADER } from "../http-client";
import type {
  ChatSession,
  ChatStreamAuth,
  ChatStreamChunk,
  CreateChatSessionBody,
  SendChatMessageBody
} from "../types/chat";
import { BaseResource } from "./base-resource";

/**
 * Chat resource. Accessed via `client.chat`.
 *
 * The headless chat surface: mint a browser credential with the org API key,
 * then stream an agent turn with that credential in the Vercel AI SDK 7 UI
 * Message Stream format.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE TWO METHODS TAKE DIFFERENT CREDENTIALS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * {@link createSession} authenticates with the org API key this client was
 * constructed with — it is a privileged act and belongs on a server.
 * {@link stream} and {@link streamRaw} authenticate with the SESSION TOKEN and
 * send NO api-key at all, because the server refuses a request that carries
 * both. That asymmetry is the security property, not an inconvenience: the
 * token names one deployment and one conversation, and holds no scopes.
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
 * @example A terminal rendering the turn as it arrives
 * ```ts
 * for await (const chunk of client.chat.stream(deploymentId, { content: "hi" }, { token })) {
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
   */
  stream(
    deploymentId: string,
    body: SendChatMessageBody,
    auth: ChatStreamAuth
  ): AsyncGenerator<ChatStreamChunk, void, undefined> {
    return this.http.requestSSE<ChatStreamChunk>("POST", `/deployments/${deploymentId}/chat`, {
      body,
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
