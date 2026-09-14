/**
 * GOLDEN CONVERSATIONS — authoring (Prompt Lab phase 2).
 *
 * A golden conversation is a reference dialogue authored turn by turn against
 * one agent+deployment: you play the end user, the agent generates each reply
 * (on the authoring variant when one was named at creation), and you accept,
 * edit, or regenerate it until it is the golden answer. AGENT turns can be
 * **checkpoints** — per-message test cases for eval runs (phase 3).
 *
 * ## Timestamps are STRINGS
 *
 * ISO-formatted, handed back exactly as the wire carried them — same policy as
 * every other resource in this package.
 */

export type GoldenConversationStatus = "DRAFT" | "READY" | "ARCHIVED";

export type GoldenTurnRole = "USER" | "AGENT";

/** One tool invocation as recorded at authoring (display + judge context). */
export interface GoldenRecordedToolCall {
  name: string;
  input?: unknown;
  output?: unknown;
}

/** One custom judge criterion attached to a checkpoint. */
export interface GoldenCheckpointCriterion {
  name: string;
  rubric: string;
  weight?: number;
}

export interface GoldenTurn {
  id: string;
  conversationId: string;
  /** 0-based position; unique and contiguous per conversation. */
  index: number;
  role: GoldenTurnRole;
  content: string;
  toolCalls: GoldenRecordedToolCall[] | null;
  /** The agent turn was hand-edited rather than accepted as generated. */
  edited: boolean;
  /** AGENT turns only; defaults ON when a turn is accepted. */
  isCheckpoint: boolean;
  criteria: GoldenCheckpointCriterion[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoldenConversation {
  id: string;
  agentId: string;
  deploymentId: string;
  title: string;
  description: string | null;
  status: GoldenConversationStatus;
  /** The version generation runs under. Null = the live prompt. */
  authoringVersionId: string | null;
  /** True while a generated candidate awaits accept/regenerate. */
  hasPendingCandidate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoldenConversationDetail extends GoldenConversation {
  turns: GoldenTurn[];
}

export interface CreateGoldenConversationBody {
  agentId: string;
  deploymentId: string;
  title: string;
  description?: string;
  /** Variant whose TIP becomes the authoring version: name, id, or "main". */
  variant?: string;
}

export interface ListGoldenConversationsParams {
  agentId?: string;
}

export interface AddGoldenUserTurnBody {
  text: string;
}

/** The candidate a generate produced; `sessionId` is fresh per call. */
export interface GoldenCandidate {
  content: string;
  toolCalls: GoldenRecordedToolCall[];
  sessionId: string;
  latencyMs: number | null;
  tokensUsed: { input: number; output: number; total: number } | null;
}

export interface GenerateGoldenCandidateResult {
  conversationId: string;
  sessionId: string;
  candidate: GoldenCandidate;
}

export interface AcceptGoldenCandidateBody {
  /** Present = accept-with-edit; the turn is flagged `edited`. */
  content?: string;
}

export interface SetGoldenTurnContentBody {
  content: string;
}

export interface SetGoldenCheckpointBody {
  isCheckpoint: boolean;
  /** Omitted = keep stored criteria; null = clear; a list replaces. */
  criteria?: GoldenCheckpointCriterion[] | null;
}

export interface DeleteGoldenConversationResult {
  deleted: true;
}
