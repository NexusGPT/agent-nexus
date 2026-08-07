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

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  senderType: MessageSenderType;
  author: MessageAuthor;
  sender?: MessageSender | null;
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

export interface GetMessagesParams {
  limit?: number;
  before?: string;
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
