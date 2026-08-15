import type { AgentModel, AgentStatus, ModelConfig } from "./common";

// ============================================================================
// Agent Summary (list endpoint)
// ============================================================================

/** Agent summary returned by `client.agents.list()`. */
export interface AgentSummary {
  /** Unique agent UUID. */
  id: string;
  /** Agent's first name. */
  firstName: string;
  /** Agent's last name. */
  lastName: string;
  /** Agent's role or job title (e.g. "Customer Support Agent"). */
  role: string;
  /** Short biography displayed in agent cards. */
  shortBio: string | null;
  /** URL to the agent's profile picture. */
  profilePicture: string | null;
  /** Agent lifecycle status. */
  status: AgentStatus;
  /** Model identifier. Must be a valid `AgentModel` enum value (e.g. "GPT_4_1", "DEFAULT"). Use `client.models.list()` to get all available models. */
  model: AgentModel | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string | null;
}

// ============================================================================
// Agent Detail (get endpoint — extends summary)
// ============================================================================

/** Full agent detail returned by `client.agents.get()` and `client.agents.create()`. */
export interface AgentDetail extends AgentSummary {
  /** Full biography / background information. */
  bio: string | null;
  /** Comma-separated tags for categorization. */
  tags: string | null;
  /** Agent's gender (used for avatar/persona). */
  gender: string | null;
  /** Unified model configuration. Use `client.models.list()` to get available models. Preferred over legacy `model` field. */
  modelConfig: ModelConfig | null;
  /** Human-readable model name derived from modelConfig (e.g. "claude-sonnet-4-6"). */
  modelName: string | null;
  /** Model provider derived from modelConfig (e.g. "ANTHROPIC", "OPEN_AI"). */
  modelProvider: string | null;
  /** First message displayed when opening the agent playground. */
  playgroundFirstMessage: string | null;
  /**
   * The agent's system prompt in markdown format — the DRAFT, which is not
   * necessarily what the agent serves. A published agent serves its production
   * version until a new one is published. Write it with `prompt` on
   * `client.agents.update()`, or with `client.agents.versions.createCheckpoint()`.
   */
  prompt: string | null;
}

// ============================================================================
// Request bodies
// ============================================================================

/** Request body for `client.agents.create()`. */
export interface CreateAgentBody {
  /** Agent's first name (required). */
  firstName: string;
  /** Agent's last name (required). */
  lastName: string;
  /** Agent's role or job title (required). */
  role: string;
  /** Short biography displayed in agent cards. */
  shortBio?: string;
  /** Full biography / background information. */
  bio?: string;
  /** Comma-separated tags for categorization. */
  tags?: string;
  /** Agent's gender (used for avatar/persona). */
  gender?: string;
  /** Legacy model enum field. Prefer `modelConfig` instead for full provider support (Claude, Gemini, etc.). */
  model?: AgentModel;
  /** Unified model configuration. Use `client.models.list()` to get available models. */
  modelConfig?: ModelConfig;
  /** Human-readable model name (e.g. "Claude Sonnet 4.5"). */
  modelName?: string;
  /** Model provider (e.g. "anthropic", "openai"). */
  modelProvider?: string;
  /** First message displayed when opening the agent playground. Set to `null` to clear. */
  playgroundFirstMessage?: string | null;
  /**
   * Initial system prompt (markdown). Creates and publishes a CHECKPOINT version
   * for the new agent. Omit to start with an empty prompt.
   */
  prompt?: string;
}

/** Request body for `client.agents.update()`. All fields are optional — only provided fields are updated. */
export interface UpdateAgentBody {
  /** Agent's first name. */
  firstName?: string;
  /** Agent's last name. */
  lastName?: string;
  /** Agent's role or job title. */
  role?: string;
  /** Short biography displayed in agent cards. */
  shortBio?: string;
  /** Full biography / background information. */
  bio?: string;
  /** Comma-separated tags for categorization. */
  tags?: string;
  /** Agent's gender (used for avatar/persona). */
  gender?: string;
  /** Legacy model enum field. Prefer `modelConfig` instead for full provider support (Claude, Gemini, etc.). */
  model?: AgentModel;
  /** Unified model configuration. Use `client.models.list()` to get available models. */
  modelConfig?: ModelConfig;
  /** Human-readable model name. */
  modelName?: string;
  /** Model provider. */
  modelProvider?: string;
  /** First message displayed when opening the agent playground. Set to `null` to clear. */
  playgroundFirstMessage?: string | null;
  /**
   * System prompt (markdown). OVERWRITES the agent's draft, snapshots the
   * previous draft as an AUTO version, and creates a CHECKPOINT version.
   * Whether that checkpoint becomes what the agent SERVES is `autoPublish`.
   */
  prompt?: string;
  /**
   * Publish the checkpoint `prompt` creates, making it live on every deployment.
   * Defaults to `true`. Send `false` to edit the draft and leave the currently
   * published version serving traffic. Ignored when `prompt` is absent.
   */
  autoPublish?: boolean;
}

// ============================================================================
// Query params
// ============================================================================

/** Query parameters for `client.agents.list()`. */
export interface ListAgentsParams {
  /** Page number (1-based, default 1). */
  page?: number;
  /** Items per page (default 20). */
  limit?: number;
  /** Filter by agent status. */
  status?: AgentStatus;
  /** Free-text search across agent names and roles. */
  search?: string;
}

// ============================================================================
// Upload response
// ============================================================================

/** Response from `client.agents.uploadProfilePicture()`. */
export interface UploadProfilePictureResponse {
  /** URL to the uploaded profile picture. */
  profilePicture: string;
}
