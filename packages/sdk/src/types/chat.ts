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
