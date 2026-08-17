// ============================================================================
// Emulator types
// ============================================================================

/** A participant in an emulator session. */
export interface EmulatorParticipant {
  id: string;
  identifier: string;
  displayName?: string;
}

/** File attached to an emulator message. */
export interface EmulatorMessageFile {
  id: string;
  url: string;
  name?: string;
  mimeType?: string;
}

/** A message within an emulator session. */
export interface EmulatorMessage {
  id: string;
  content: string | null;
  type: string | null;
  createdAt: string;
  participantId?: string;
  /**
   * True when the message carries tool calls, meaning the turn continues past
   * it. A tool-augmented turn persists one `AI` message per model call and
   * every one but the last requests a tool, so a turn has produced its answer
   * only once an `AI` message with `hasToolCalls: false` appears — polling for
   * any `AI` message after a `status: "processing"` send reports completion
   * mid-turn. Optional because servers predating this field omit it.
   */
  hasToolCalls?: boolean;
  files?: EmulatorMessageFile[];
}

/** Summary of an emulator session (returned by list). */
export interface EmulatorSession {
  id: string;
  deploymentId: string;
  chatId: string | null;
  participants: EmulatorParticipant[];
  emulatedChannelType: string;
  createdAt: string;
}

/** Detailed emulator session with messages (returned by get). */
export interface EmulatorSessionDetail extends EmulatorSession {
  messages: EmulatorMessage[];
}

/** Debug information returned after sending a message. */
export interface EmulatorDebugInfo {
  agentId: string | null;
  modelUsed: string | null;
  tokensUsed: { input: number; output: number; total: number };
  latencyMs: number;
  toolsInvoked: string[];
  traceId?: string;
  runId?: string;
  runStatus?: string;
}

/** Result of sending a message in an emulator session. */
export interface EmulatorSendMessageResult {
  chatId: string;
  messageId: string;
  sessionId: string;
  /**
   * "completed" — the agent turn finished before the server responded (debug
   * present when available). "processing" — the turn exceeded the server's
   * sync wait window and continues in the background; fetch the session
   * (getSession) to read the answer once it lands. "failed" — the turn
   * settled but the agent errored (the error is recorded on the chat).
   * Optional because servers predating this field omit it (their responses
   * are always settled turns).
   */
  status?: "completed" | "processing" | "failed";
  debug?: EmulatorDebugInfo;
}

// ============================================================================
// Streaming (SSE)
// ============================================================================

/**
 * One frame of `client.emulator.streamMessage()`.
 *
 * The stream always opens with `start` and always ends with `done`; a failed
 * turn sends `error` and then `done`, so `done` is the single termination rule.
 *
 * Mirrors `EmulatorStreamEventSchema` in `@nexus/types` — the server validates
 * every frame against it before writing, so a frame that reaches a caller has
 * this shape.
 */
export type EmulatorStreamEvent =
  /** Correlation, before the first token. */
  | { type: "start"; sessionId: string; chatId: string; messageId: string }
  /** One delta of the agent's answer; concatenating them rebuilds the text. */
  | { type: "token"; messageId: string; delta: string }
  /** One delta of the model's reasoning, where the model emits it. */
  | { type: "thinking"; messageId: string; delta: string }
  /** A tool's leading (`started`) and trailing (`completed`) edge, sharing a `toolCallId`. */
  | {
      type: "tool_call";
      status: "started" | "completed";
      messageId: string;
      toolCallId?: string;
      name?: string;
      toolType?: string;
      content?: { text: string } & Record<string, unknown>;
    }
  /** A message row reached its final state. `contentType: "AI"` is the answer. */
  | {
      type: "message";
      messageId: string;
      contentType?: string;
      content: { text: string } & Record<string, unknown>;
    }
  /** The turn failed. A `done` frame still follows. */
  | { type: "error"; messageId?: string; code: string; message: string }
  /** Terminal. `processing` means the turn outlived the stream and is still running. */
  | {
      type: "done";
      chatId: string;
      messageId: string;
      status: "completed" | "processing" | "failed";
    };

/** Summary of a scenario (returned by list). */
export interface EmulatorScenario {
  id: string;
  name: string;
  description: string | null;
  deploymentId: string;
  messageCount: number;
  createdAt: string;
}

/** A message within a scenario. */
export interface EmulatorScenarioMessage {
  id: string;
  sequenceOrder: number;
  participantId: string;
  participantName: string | null;
  content: string;
  attachments: unknown;
  delayMs: number;
}

/** Detailed scenario with messages (returned by get). */
export interface EmulatorScenarioDetail extends EmulatorScenario {
  messages: EmulatorScenarioMessage[];
}

// ============================================================================
// Request bodies
// ============================================================================

export interface CreateEmulatorSessionBody {
  participants?: Array<{
    identifier?: string;
    displayName?: string;
  }>;
}

export interface SendEmulatorMessageBody {
  content: string;
  participantId?: string;
  knowledgeIds?: string[];
  images?: string[];
  /** Business's own user identifier for customer identity resolution */
  externalUserId?: string;
  /** Nexus Customer ID for direct customer linking */
  customerId?: string;
}

export interface SaveEmulatorScenarioBody {
  name: string;
  description?: string;
  sessionId: string;
  deploymentId: string;
}

export interface ReplayEmulatorScenarioBody {
  deploymentId: string;
}

export interface ListEmulatorScenariosParams {
  deploymentId?: string;
}

/**
 * Response from `client.emulator.replayScenario()`.
 *
 * The replay runs in a NEW session — `sessionId` is that new session, not the
 * one the scenario was recorded on. Messages are replayed in the background, so
 * this returns as soon as the session exists rather than when the replay ends.
 */
export interface ReplayScenarioResponse {
  /** UUID of the new session the replay runs in. */
  sessionId: string;
  /** UUID of the chat backing the session, or `null` before one exists. */
  chatId: string | null;
}
