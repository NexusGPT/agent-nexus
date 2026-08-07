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
  debug?: EmulatorDebugInfo;
}

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
