/**
 * The browser chat surface — the `useChat` target.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE TWO HOPS, AND WHY THERE ARE TWO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * An organization API key can read every conversation in the organization, so it
 * can never ship to a browser. The chat surface is therefore reached in two
 * hops:
 *
 *   1. The customer's SERVER calls `chat.createSession(deploymentId)` with the
 *      org API key. It gets back a short-lived, deployment-scoped token naming
 *      ONE conversation.
 *   2. The BROWSER holds that token and streams turns with it. It never sees the
 *      API key.
 *
 * Both hops are in this SDK: hop 1 because it is a server-side call, hop 2
 * because a customer proxying the stream through their own backend does it from
 * Node as well.
 *
 * ── The types below are hand-written, and that is the house rule ────────────
 *
 * This package publishes with `"dependencies": {}` and its declaration files
 * must resolve in a consumer's tree, so nothing here may reference
 * `@nexus/types` — which is a private workspace package. Every SDK type is a
 * hand-written mirror of the contract's, and
 * `types/types-match-the-v1-contract.test.ts` is where a pair gets tied.
 */

/**
 * Body of `chat.createSession()`. Every field is optional — the minimal call
 * names only the deployment and mints an anonymous session on a fresh
 * conversation.
 */
export interface CreateChatSessionBody {
  /**
   * The customer's own id for this visitor. Carried into the session token only
   * when identity verification is satisfied; otherwise the session is anonymous.
   */
  externalUserId?: string;
  /**
   * HMAC-SHA256 hex of `externalUserId` under the deployment's embed
   * `identityVerificationSecret`. Only meaningful when the deployment has
   * `identityVerificationEnabled`.
   */
  identityHash?: string;
  /**
   * Resume an existing conversation. It must belong to this organization AND
   * this deployment; anything else answers 404, the same as an id that does not
   * exist.
   *
   * Omit it to start a new one: the response carries the reserved `chatId` and
   * the row is created on the first message.
   */
  chatId?: string;
}

/**
 * What a mint hands back — the credential a browser may hold.
 *
 * ## A 401 from a chat route means "come back here"
 *
 * `expiresInSeconds` is the bearer lifetime. Treat ANY 401 from the streaming
 * route as "this credential is finished" and mint a fresh session. The causes
 * are deliberately indistinguishable from outside — expired, revoked, wrong
 * deployment and forged all answer identically — so a caller cannot use the
 * refusal to learn which deployment or conversation ids are real.
 */
export interface ChatSession {
  /** The bearer credential. Opaque — do not parse it. */
  token: string;
  /** This session's own id, for correlating server-side records with a visitor. */
  sessionId: string;
  /** The conversation this token addresses. */
  chatId: string;
  /** Bearer lifetime in seconds. */
  expiresInSeconds: number;
}

/**
 * One part of an AI SDK `UIMessage`.
 *
 * Declared only as far as the server READS it, which is the `text` arm. A stock
 * `useChat` also sends `file`, `reasoning`, `tool-*` and `data-*` parts; they
 * are accepted and ignored, because the server holds the conversation and never
 * reconstructs it from a client-supplied array.
 */
export interface UiMessagePart {
  type: string;
  text?: string;
}

/** One message of the AI SDK's client-side history. */
export interface UiMessage {
  id?: string;
  role: string;
  parts?: UiMessagePart[];
}

/**
 * Body of a chat turn — what a stock `useChat` POSTs, plus a plain-`fetch` door.
 *
 * ## 🔴 THE SERVER READS ONLY THE LAST USER MESSAGE
 *
 * The conversation lives in the Nexus database. `messages` is validated for
 * shape and then used for exactly one thing: extracting the text the visitor
 * just typed, when `content` was not supplied. There is deliberately NO
 * `chatId` field — the conversation is named by the session token's own claim,
 * and no request body can move it. `id`, `trigger` and `messageId` are the AI
 * SDK's own fields: accepted so a stock transport works unchanged, and ignored.
 *
 * The body is refused for an UNKNOWN KEY rather than having it stripped, so a
 * misspelling is a 400 by name instead of a 200 that silently did something
 * else.
 *
 * ## The size cap is on the TURN, not on a field
 *
 * The server bounds the text it EXTRACTS — `content`, or the joined text parts
 * of the last user message — so a large `messages` HISTORY streams normally
 * while one oversized turn is a 400. No number is restated here on purpose: a
 * second copy of a server bound is a drift channel with nothing to gate it.
 * Read the 400's own message, which names the limit.
 */
export interface SendChatMessageBody {
  /**
   * The message text, for a caller that is not the AI SDK. When present it WINS
   * over `messages`.
   */
  content?: string;
  /** The AI SDK's client-side history. Read only for its last user message. */
  messages?: UiMessage[];
  /** The AI SDK's own conversation id. Accepted and IGNORED. */
  id?: string;
  /** `"submit-message"` / `"regenerate-message"`. Accepted and ignored. */
  trigger?: string;
  /** The AI SDK's id for the message being sent. Accepted and ignored. */
  messageId?: string;
  /** Knowledge documents to attach to this turn. */
  knowledgeIds?: string[];
  /** Image URLs to attach to this turn. */
  images?: string[];
}

/**
 * `finish.finishReason`, closed at six members.
 *
 * The raw provider word (Anthropic's `end_turn`, OpenAI's `tool_calls`) never
 * reaches the wire — the server maps it. A value outside this set is a server
 * defect, not something to accommodate.
 */
export type ChatStreamFinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other";

/** Provider-native data attached to a chunk, keyed by provider. */
export type ChatStreamProviderMetadata = Record<string, Record<string, unknown>>;

/**
 * One frame of a chat stream — a Vercel AI SDK 7 `UIMessageChunk`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE UNION IS THE SDK'S WHOLE UNION, NOT THE SUBSET NEXUS EMITS TODAY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Twelve of these members have no producer on the Nexus side yet. They are
 * declared anyway, for the same reason the server's schema declares them: a
 * member left out is a member this SDK's consumers cannot handle the day a
 * producer appears, and a `switch` written against a narrower union silently
 * stops being exhaustive rather than failing to compile.
 *
 * ⚠️ **DO NOT read a member's presence here as a promise that it arrives.**
 * What a Nexus turn actually emits, observed on the wire: `start`,
 * `text-start`, `text-delta`, `text-end`, `finish`, `tool-input-start`,
 * `tool-input-available`, `tool-output-available`, `tool-output-error`,
 * `data-nexus-*` and `error`. `finish` carries `finishReason` and nothing else —
 * usage is billed server-side and is not on this bus.
 *
 * Branch on `type` and treat an unrecognised one as inert; the wire is
 * deliberately loose, so a frame may carry keys this type does not name.
 */
export type ChatStreamChunk =
  | { type: "start"; messageId?: string; messageMetadata?: unknown }
  | { type: "start-step" }
  | { type: "text-start"; id: string; providerMetadata?: ChatStreamProviderMetadata }
  | {
      type: "text-delta";
      id: string;
      delta: string;
      providerMetadata?: ChatStreamProviderMetadata;
    }
  | { type: "text-end"; id: string; providerMetadata?: ChatStreamProviderMetadata }
  | { type: "reasoning-start"; id: string; providerMetadata?: ChatStreamProviderMetadata }
  | {
      type: "reasoning-delta";
      id: string;
      delta: string;
      providerMetadata?: ChatStreamProviderMetadata;
    }
  | { type: "reasoning-end"; id: string; providerMetadata?: ChatStreamProviderMetadata }
  | {
      type: "tool-input-start";
      toolCallId: string;
      toolName: string;
      providerExecuted?: boolean;
      providerMetadata?: ChatStreamProviderMetadata;
      toolMetadata?: Record<string, unknown>;
      dynamic?: boolean;
      title?: string;
    }
  | { type: "tool-input-delta"; toolCallId: string; inputTextDelta: string }
  | {
      type: "tool-input-available";
      toolCallId: string;
      toolName: string;
      input: unknown;
      providerExecuted?: boolean;
      providerMetadata?: ChatStreamProviderMetadata;
      toolMetadata?: Record<string, unknown>;
      dynamic?: boolean;
      title?: string;
    }
  | {
      type: "tool-input-error";
      toolCallId: string;
      toolName: string;
      input: unknown;
      errorText: string;
      providerExecuted?: boolean;
      providerMetadata?: ChatStreamProviderMetadata;
      toolMetadata?: Record<string, unknown>;
      dynamic?: boolean;
      title?: string;
    }
  | {
      type: "tool-approval-request";
      approvalId: string;
      toolCallId: string;
      isAutomatic?: boolean;
      signature?: string;
    }
  | {
      type: "tool-approval-response";
      approvalId: string;
      approved: boolean;
      reason?: string;
      providerExecuted?: boolean;
      providerMetadata?: ChatStreamProviderMetadata;
    }
  | {
      type: "tool-output-available";
      toolCallId: string;
      output: unknown;
      providerExecuted?: boolean;
      providerMetadata?: ChatStreamProviderMetadata;
      toolMetadata?: Record<string, unknown>;
      dynamic?: boolean;
      preliminary?: boolean;
    }
  | {
      type: "tool-output-error";
      toolCallId: string;
      errorText: string;
      providerExecuted?: boolean;
      providerMetadata?: ChatStreamProviderMetadata;
      toolMetadata?: Record<string, unknown>;
      dynamic?: boolean;
    }
  | { type: "tool-output-denied"; toolCallId: string }
  | {
      type: "source-url";
      sourceId: string;
      url: string;
      title?: string;
      providerMetadata?: ChatStreamProviderMetadata;
    }
  | {
      type: "source-document";
      sourceId: string;
      mediaType: string;
      title: string;
      filename?: string;
      providerMetadata?: ChatStreamProviderMetadata;
    }
  | { type: "file"; url: string; mediaType: string; providerMetadata?: ChatStreamProviderMetadata }
  | {
      type: "reasoning-file";
      url: string;
      mediaType: string;
      providerMetadata?: ChatStreamProviderMetadata;
    }
  | { type: "custom"; kind: `${string}.${string}`; providerMetadata?: ChatStreamProviderMetadata }
  | { type: `data-${string}`; id?: string; data: unknown; transient?: boolean }
  | { type: "finish-step" }
  | { type: "finish"; finishReason?: ChatStreamFinishReason; messageMetadata?: unknown }
  | { type: "abort"; reason?: string }
  | { type: "error"; errorText: string }
  | { type: "message-metadata"; messageMetadata: unknown };

/** How a caller presents the browser credential to a streaming call. */
export interface ChatStreamAuth {
  /**
   * The chat-session token from {@link ChatSession.token}.
   *
   * 🔴 REQUIRED, and it REPLACES the org API key rather than accompanying it.
   * The server tries the api-key credential first and short-circuits on it, so a
   * request carrying both authenticates as the API key and is then refused 401
   * by the handler with a message that reads like an expired token.
   */
  token: string;
}

/**
 * How a turn ended, as the status route spells it.
 *
 * A hand-written mirror of the contract's `CHAT_TURN_OUTCOMES`, tied to it by
 * `v1-response-types-match-the-contract.test.ts`.
 *
 * 🔑 **`stopped` IS THE MEMBER THAT ONLY EXISTS HERE, AND THE STREAM CANNOT
 * SUBSTITUTE FOR IT.** Measured on two staging deployments: one stopped turn
 * ended `abort` → `finish {"finishReason":"other"}`, the other ended
 * `data-nexus-error` → `error`, because the provider surfaced the cancellation
 * as a failure. Even `"other"` is not a word for "stopped" — it is the SDK
 * union's bucket for anything that ended a turn early. This field was
 * `"stopped"` in both.
 */
export type ChatTurnOutcome = "completed" | "failed" | "stopped";

/**
 * Body of `chat.stop()`. Both the field and the whole object are optional.
 *
 * 🔴 THE CONVERSATION IS NOT IN IT AND CANNOT BE. It is the session token's own
 * `chatId` claim, resolved server-side at mint — the same reason it is absent
 * from {@link SendChatMessageBody}.
 */
export interface StopChatTurnBody {
  /**
   * The turn to stop. Omitted, the newest unsettled turn is taken.
   *
   * Supplying it is strictly safer: a stop that raced a turn ending cannot then
   * reach the turn that started after the client last looked. Read it from
   * {@link ChatTurnStatus.turnId}.
   */
  turnId?: string;
}

/**
 * What `chat.stop()` hands back.
 *
 * 🔴 **`accepted` IS NOT "THE TURN HAS STOPPED", AND THE DIFFERENCE IS FORCED
 * BY THE TRANSPORT.** The abort reaches the pod running the generation through
 * a fire-and-forget publish, so no value this request can compute knows whether
 * it landed. Measured on the live route: deltas keep arriving for a few hundred
 * milliseconds after the 200, and the terminal frames land about a second and a
 * half later.
 *
 * Poll {@link ChatResource.status} and read `outcome === "stopped"` for the
 * fact this response deliberately does not claim.
 */
export interface ChatStopResult {
  /** Whether a live turn was found to address the stop TO. */
  accepted: boolean;
  /** The turn the stop was addressed to, or `null` when none was running. */
  turnId: string | null;
}

/**
 * What is happening on a conversation right now.
 *
 * Read from the durable stream log rather than from the pod's own execution
 * slot, so every replica answers the same. A slot-based reading would report
 * "nothing is running" on (n-1)/n of the pods for a turn that is running.
 */
export interface ChatTurnStatus {
  /** The newest turn of this conversation, or `null` for one that has none. */
  turnId: string | null;
  /**
   * `true` while nothing has recorded the turn ending.
   *
   * ⚠️ A statement about the RECORD, not a heartbeat. A turn whose pod died
   * before it could settle also reads `true`, for ever. Nothing on this surface
   * can tell the two apart, and reporting a live turn as finished would be the
   * worse error.
   */
  running: boolean;
  /** How it ended, once it has. `null` while it is running. */
  outcome: ChatTurnOutcome | null;
  /**
   * The cursor of the newest frame RECORDED — not of the newest frame you
   * received.
   *
   * 🔴 **DO NOT RESUME FROM THIS AFTER A DROP.** A client that dropped is
   * behind the log, so resuming here silently skips every frame written in
   * between. Measured: `frameCount` moved 13 → 17 in the three seconds after a
   * stop was accepted, all of it after the client had stopped reading. It is the right cursor for a client that is level with the stream
   * and useful for reporting; the cursor for a RESUME is the one you kept
   * yourself, through {@link ChatStreamOptions.onEventId}.
   */
  lastEventId: string | null;
  /** How many frames the turn has produced so far. */
  frameCount: number;
}

/** Options common to every streaming door on {@link ChatResource}. */
export interface ChatStreamOptions {
  /**
   * Called with the SSE `id:` of each frame, AFTER that frame has been
   * consumed.
   *
   * The `id` is this stream's resume cursor and the only place it appears: a
   * frame iterator yields parsed `data:` payloads, so the field is otherwise
   * dropped on the floor. Keep the last one and hand it back as
   * {@link ChatResumeOptions.lastEventId} to reattach exactly where you left
   * off.
   *
   * 🔑 **A FRAME WITH NO `id:` MUST NOT MOVE THE CURSOR, AND THE SERVER RELIES
   * ON THAT.** The first frame of a resumed stream is a SYNTHESISED opener for
   * a block that was still open at the cursor; it is not a log entry, carries
   * no `id:`, and this callback is therefore not called for it. Storing a
   * position for it would replay the block's opener as if it were content.
   */
  onEventId?: (eventId: string) => void;
}

/**
 * Where to reattach a resumed stream. Both resume doors take this.
 *
 * A separate interface from {@link ChatResumeOptions} because
 * `ChatResource.resumeRaw` hands back undecoded bytes and never parses a frame,
 * so `onEventId` could not fire there. An option a method silently ignores is
 * worse than one it does not offer.
 */
export interface ChatResumeCursor {
  /**
   * The `id` of the last frame you received, sent as `Last-Event-ID`.
   *
   * 🔑 **THE CURSOR IS EXCLUSIVE: the replay begins at the frame AFTER this
   * one.** Omit it and the whole newest turn is replayed from its first frame,
   * which is what a page that reloaded and holds nothing wants.
   *
   * Never re-send a cursor for text you have already rendered without it —
   * a text block accumulates by APPENDING deltas, so a replay you did not need
   * duplicates the answer rather than overwriting it.
   */
  lastEventId?: string;
}

/** Options for {@link ChatResource.resume}, the frame-parsing resume door. */
export interface ChatResumeOptions extends ChatResumeCursor, ChatStreamOptions {}
