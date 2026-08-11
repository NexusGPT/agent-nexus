// ============================================================================
// Conversation types
// ============================================================================

export type ConversationStatus = "OPEN" | "RUNNING" | "ARCHIVED" | "DELETED";
export type ConversationTicketStatus =
  | "SUBMITTED"
  | "IN_PROGRESS"
  | "WAITING_ON_CUSTOMER"
  | "RESOLVED";
export type ConversationResponseHandling = "AUTO" | "ON_APPROVAL" | "MANUAL";
export type MessageRole = "USER" | "AGENT" | "SYSTEM";
/**
 * Fine-grained author classification (NEX-2693). `role` collapses everything
 * from your side into AGENT; `senderType` splits the AI agent (AI_AGENT) from
 * a human advisor replying in the inbox (HUMAN_AGENT).
 */
export type MessageSenderType = "CUSTOMER" | "AI_AGENT" | "HUMAN_AGENT" | "SYSTEM";
/**
 * What KIND of record a message row is (NEX-2894). `role`/`senderType` answer
 * *who*; this answers *what*. A conversation stores the agent runtime's own
 * working memory alongside real replies — tool results, tool-call turns and
 * system rows all persist as `role: "AGENT"`.
 *
 *   USER_MESSAGE — inbound from the customer
 *   REPLY        — prose (or files) sent from your side: AI or human advisor
 *   TOOL_CALL    — an agent turn that only invoked tools; no body was sent
 *   TOOL_RESULT  — raw tool output, notice or error, written for the model
 *   SYSTEM       — system rows
 *   INTERNAL     — runtime bookkeeping (synthetic steering messages, envelopes)
 *
 * Treat the union as open — filter on `customerVisible` rather than
 * enumerating types if you want the conversation as the human experienced it.
 */
export type MessageType =
  | "USER_MESSAGE"
  | "REPLY"
  | "TOOL_CALL"
  | "TOOL_RESULT"
  | "SYSTEM"
  | "INTERNAL";

// ============================================================================
// Response types
// ============================================================================

export interface MessageFile {
  id: string;
  name: string | null;
  url: string | null;
  contentType: string | null;
}

export interface MessageAuthor {
  /** User id of the human advisor (HUMAN_AGENT rows), null otherwise. */
  userId: string | null;
  /** Agent id of the AI agent (AI_AGENT rows), null otherwise. */
  agentId: string | null;
  /** Resolved display name of the author, or null. */
  name: string | null;
}

/**
 * Channel-side sender of a CUSTOMER message on a multi-party group thread
 * (e.g. WhatsApp groups). Null on 1:1 threads — read the conversation-level
 * `contact` there.
 */
export interface MessageSender {
  identifier: string | null;
  displayName: string | null;
}

/**
 * Tool provenance, set only on `TOOL_CALL` and `TOOL_RESULT` rows. `callId` is
 * the correlation key: it appears in `calls` on the turn that issued the
 * invocation and again as `callId` on the row carrying its result.
 */
export interface MessageTool {
  /** TOOL_RESULT — the tool call this row answers. */
  callId: string | null;
  /** TOOL_RESULT — name of the tool that produced this row. */
  name: string | null;
  /** Tool family: EXTERNAL_TOOL, WORKFLOW, PLUGIN, TASK, … */
  toolType: string | null;
  /** TOOL_CALL — the invocations this agent turn issued. */
  calls: Array<{ id: string | null; name: string | null }> | null;
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  senderType: MessageSenderType;
  /** What kind of record this is — see `MessageType`. */
  type: MessageType;
  /**
   * True only for records the customer actually saw: an inbound message, or a
   * reply that carried a body. Everything the agent runtime wrote for its own
   * consumption is false.
   */
  customerVisible: boolean;
  author: MessageAuthor;
  sender?: MessageSender | null;
  /** Tool provenance on TOOL_CALL / TOOL_RESULT rows; null on every other type. */
  tool: MessageTool | null;
  content: string | null;
  status: string | null;
  createdAt: string;
  files: MessageFile[];
  /**
   * Inbound media URLs (e.g. WhatsApp photos persisted to durable storage).
   * Documents arrive under `files` instead. Absent on servers predating the field.
   */
  images?: string[];
}

export interface ConversationComment {
  id: string;
  content: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  /** Public-facing shortcode (e.g. `4M7O9_BS76Q`). Null on historical rows pre-nanoId migration. */
  nanoId: string | null;
  topic: string | null;
  status: ConversationStatus;
  ticketStatus: ConversationTicketStatus;
  responseHandling: ConversationResponseHandling;
  deploymentId: string | null;
  assignedUserIds: string[];
  unread: boolean;
  /** ID of the most recent message (`Message.id`), or null when the chat has no messages. */
  lastMessageId: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  /** Same value as `lastMessageAt` (`Chat.lastMessageUpdatedAt`); matches inbox.list shape. */
  lastMessageUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SatisfactionFramework =
  | "THUMBS"
  | "LEGACY_5_STAR"
  | "NPS"
  | "CSAT"
  | "AI_PASSIVE"
  | "CUSTOM";
export type SatisfactionSource = "CUSTOMER_PROMPTED" | "AI_PASSIVE" | "LEGACY";

export interface SatisfactionScore {
  id: string;
  framework: SatisfactionFramework;
  source: SatisfactionSource;
  /**
   * Framework-aware integer: THUMBS -1..1, LEGACY_5_STAR 1-5, NPS 0-10,
   * CSAT 1-5, AI_PASSIVE 1-5, CUSTOM open.
   */
  rawScore: number;
  /** Legacy float score — kept for compatibility with pre-framework readers. */
  score: number;
  reasoning: string | null;
  comment: string | null;
  createdAt: string;
}

/**
 * Satisfaction projection on `ConversationDetail`. Populated only when the
 * `satisfaction` query param is set on `GET /conversations/:id`.
 *
 * `latest` is always present (or `null`) when satisfaction is requested. `all`
 * and `totalCount` are added in `summary` / `all` modes. `truncated: true` when
 * the server capped the `all` array at the hard limit (1000 rows).
 */
export interface Satisfaction {
  latest: SatisfactionScore | null;
  all?: SatisfactionScore[];
  totalCount?: number;
  truncated?: boolean;
}

export type SatisfactionMode = "latest" | "all" | "summary";

/**
 * Channel-authenticated contact of a conversation, resolved from the
 * deployment session's customer identity. `identifier` is the value the
 * channel verified (WhatsApp/SMS → inbound E.164 `From`, email → sender
 * address, embed → external user id) — safe for sender-based authorization
 * because it never comes from message text.
 */
export interface ConversationContact {
  identifier: string;
  service: string | null;
  displayName: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  externalUserId: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  deploymentName: string | null;
  channelType: string | null;
  memberCount: number;
  /** Null when the conversation has no channel session or no linked identity. */
  contact?: ConversationContact | null;
  /** Custom metadata stored on the conversation (`Chat.metadata`). Null if none set. */
  metadata: Record<string, unknown> | null;
  satisfaction?: Satisfaction;
}

// ============================================================================
// Request bodies
// ============================================================================

export interface UpdateConversationStatusesBody {
  status?: ConversationStatus;
  ticketStatus?: ConversationTicketStatus;
  responseHandling?: ConversationResponseHandling;
}

export interface SetAssignedUsersBody {
  userIds: string[];
}

export interface UpdateConversationTopicBody {
  topic: string;
}

/**
 * Body for `conversations.updateMetadata`. The patch is shallow-merged into the
 * conversation's existing metadata: a non-null value overwrites that key, a
 * `null` value clears it, and absent keys are left untouched.
 */
export interface UpdateConversationMetadataBody {
  metadata: Record<string, unknown>;
}

export interface AddConversationCommentBody {
  content: string;
}

export interface SendAgentMessageBody {
  content: string;
}

export interface SendWhatsappTemplateBody {
  template: {
    id: string;
    language: string;
    types: Record<string, unknown>;
  };
  templateData?: Record<string, string>;
}

// ============================================================================
// Query params
// ============================================================================

export interface ListConversationsParams {
  page?: number;
  limit?: number;
  status?: ConversationStatus;
  ticketStatus?: ConversationTicketStatus;
  ticketStatusIn?: ConversationTicketStatus[];
  ticketStatusNot?: ConversationTicketStatus;
  responseHandling?: ConversationResponseHandling;
  deploymentId?: string;
  assignedTo?: "me" | "none";
  search?: string;
  lastMessageBefore?: string;
  lastMessageAfter?: string;
  lastMessageTypeIn?: MessageRole[];
  commentContains?: string;
  commentNotContains?: string;
}

export interface SearchConversationsParams {
  query: string;
  deploymentId?: string;
}

export interface GetMessagesResult {
  messages: ConversationMessage[];
  hasMore: boolean;
  /**
   * OPAQUE cursor for the next (older) page — pass back as `before` verbatim;
   * null when `hasMore` is false. Not a date: it encodes the composite
   * `(createdAt, id)` position the server resumes on, so a page boundary that
   * falls inside a burst of same-millisecond rows loses nothing. Do not parse
   * it, and do not build one yourself.
   *
   * Always page with this rather than the oldest message you received: under
   * `visibleOnly` the page is filtered after it is read, so it can come back
   * short or empty while older messages remain.
   */
  nextBefore: string | null;
}

export interface GetMessagesParams {
  limit?: number;
  /**
   * Page cursor — the previous page's `nextBefore`, unchanged. A bare ISO-8601
   * timestamp is still accepted for compatibility, but it cannot address a
   * boundary inside a millisecond and will skip rows sharing that timestamp.
   */
  before?: string;
  /**
   * Return only records the customer actually saw (`customerVisible: true`).
   * Filtering runs before pagination, so `limit` counts real messages instead
   * of being consumed by tool plumbing. Defaults to false (full record).
   */
  visibleOnly?: boolean;
}

export interface GetConversationParams {
  /**
   * Include a satisfaction projection on the response. Omit for the cheapest
   * payload (no satisfaction join).
   *
   *   latest  → `{ latest }`                         most recent score
   *   summary → `{ latest, totalCount }`             latest + how many exist
   *   all     → `{ latest, all, totalCount, truncated? }`  full history (capped at 1000)
   */
  satisfaction?: SatisfactionMode;
}
