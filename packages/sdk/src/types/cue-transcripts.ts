import type { ModelProvider } from "./common";

/**
 * The version stamped on every transcript document the API emits.
 *
 * A corpus on disk carries no URL, so the shape is self-describing on the
 * document itself. Match on this before parsing — a future major bumps it
 * rather than reshaping documents in place.
 */
export type CueTranscriptSchemaVersion = "cue.transcript/v1";

/** The row kind of one persisted Cue message. */
export type CueMessageContentType = "SYSTEM" | "HUMAN" | "AI" | "FUNCTION" | "TOOL";

/** How a bulk export frames its stream of documents. */
export type CueTranscriptExportFormat = "ndjson" | "json";

/**
 * One persisted Cue row, with every column that carries signal.
 *
 * `content` and `toolCalls` are raw — the same bytes the runner wrote — because
 * a fine-tuning corpus needs the tool calls, tool results, reasoning and model
 * of each turn, and any narrowing is a fidelity loss no consumer can undo.
 * Their shape is row-kind dependent and deliberately not modelled here.
 */
export interface CueTranscriptMessage {
  id: string;
  type: CueMessageContentType;
  content: unknown;
  toolCalls: unknown[];
  /** Tool-use id this row answers, on a TOOL row. */
  toolCallId: string | null;
  reasoning: string | null;
  reasoningDurationMs: number | null;
  reasoningLevel: string | null;
  model: string | null;
  provider: ModelProvider | null;
  /** Background-agent display name; null on a lead-composed row. */
  agentName: string | null;
  /** Thread key — the Task/Agent tool-use id that spawned this row's subagent. */
  parentToolUseId: string | null;
  /** Conversation-scoped raw log entry id (`"<ms>-<seq>"`) this row materialized from. */
  logEntryId: string | null;
  /** Millisecond half of `logEntryId`, as a number. */
  logEntryMs: number | null;
  /** Sequence half of `logEntryId`. */
  logEntrySeq: number | null;
  createdAt: string;
  /** Knowledge ids of files attached to this turn. */
  inputFileIds: string[];
}

/**
 * One subagent's FULL transcript — not the summary it returned to the main loop
 * — keyed by the tool-use id on the parent turn that spawned it.
 */
export interface CueTranscriptAgentThread {
  parentToolUseId: string;
  /** Display names seen on this thread's rows. Normally one. */
  agentNames: string[];
  messages: CueTranscriptMessage[];
}

export interface CueTranscriptConversation {
  id: string;
  organizationId: string;
  title: string | null;
  modelId: string | null;
  /** Runner session id, when the conversation was served by a sandbox agent. */
  agentSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CueTranscriptTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Total cost in USD across the conversation's usage rows. */
  totalCost: number;
}

export interface CueTranscriptCounts {
  mainThreadMessages: number;
  agentThreads: number;
  agentThreadMessages: number;
}

/**
 * The exported document for ONE Cue conversation: the lead transcript plus
 * every subagent transcript it spawned.
 *
 * Also the unit of the bulk export — one NDJSON line, or one element of the
 * JSON array — so one parser serves both routes.
 */
export interface CueTranscriptDocument {
  schemaVersion: CueTranscriptSchemaVersion;
  /** When this document was assembled, not when the conversation ran. */
  exportedAt: string;
  conversation: CueTranscriptConversation;
  tokenUsage: CueTranscriptTokenUsage;
  counts: CueTranscriptCounts;
  /** The lead's own transcript, oldest first. */
  mainThread: CueTranscriptMessage[];
  /** One entry per spawned subagent, each oldest first. */
  agentThreads: CueTranscriptAgentThread[];
}

/** A conversation in the discovery list — no message content. */
export interface CueConversationSummary extends CueTranscriptConversation {
  messageCount: number;
}

export interface ListCueConversationsParams {
  page?: number;
  limit?: number;
  /** ISO 8601. Bounds the conversation's `updatedAt`, not `createdAt`. */
  startDate?: string;
  /** ISO 8601. Bounds the conversation's `updatedAt`, not `createdAt`. */
  endDate?: string;
}

export interface ExportCueTranscriptsParams {
  startDate?: string;
  endDate?: string;
  /** Defaults to `ndjson` server-side. */
  format?: CueTranscriptExportFormat;
  /** Caps how many conversations one export emits. Absent means the whole window. */
  limit?: number;
}
