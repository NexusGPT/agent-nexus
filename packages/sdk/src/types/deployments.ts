// ============================================================================
// Deployment type
// ============================================================================

/**
 * Channel a deployment publishes an agent to.
 *
 * These are the 22 values the Public API v1 accepts and emits. A deployment row
 * whose `type` column is null is mapped to the literal `"WIDGET"`, which is NOT
 * one of these — the column is non-null in the schema, so that fallback is
 * unreachable rather than a case to model here.
 */
export type DeploymentType =
  | "EMBED"
  | "WHATSAPP"
  | "TELEGRAM"
  | "OUTLOOK"
  | "SLACK"
  | "TEAMS"
  | "SMS"
  | "TWILIO_SMS"
  | "TWILIO_VOICE"
  | "GMAIL"
  | "FB_MESSENGER"
  | "GOOGLE_SHEETS"
  | "EXCEL_ADDIN"
  | "OUTLOOK_ADDIN"
  | "POWERPOINT_ADDIN"
  | "WORD_ADDIN"
  | "AIRTABLE"
  | "GOOGLE_MEET"
  | "ZOOM"
  | "API"
  | "IMAP"
  | "SMTP";

// ============================================================================
// Deployment (response shapes)
// ============================================================================

/** One row of `client.deployments.list()`. */
export interface DeploymentSummary {
  /** Deployment UUID. */
  id: string;
  /** Deployment display name. Empty string when the row carries none. */
  name: string;
  /** Free-text description, or `null`. */
  description: string | null;
  /** Channel this deployment publishes to. */
  type: DeploymentType;
  /** UUID of the agent behind this deployment, or `null` when unassigned. */
  agentId: string | null;
  /** Agent display name, or `null` when unassigned or unnamed. */
  agentName: string | null;
  /** Whether the deployment is serving traffic. */
  isActive: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string | null;
}

/** Response from `client.deployments.get()`, `create()` and `update()`. */
export interface DeploymentDetail extends DeploymentSummary {
  /** Channel-specific settings. Shape depends on {@link DeploymentType}. */
  settings: unknown;
  /**
   * State of the underlying provider connection, or `null` when the channel
   * needs none. Derived from the OAuth connection's status, falling back to the
   * API-key connection's.
   */
  connectionStatus: string | null;
}

/**
 * Response from `client.deployments.delete()`.
 *
 * Deliberately NOT the shared `DeleteResponse`: this endpoint returns the id
 * alone and emits no `deleted` field.
 */
export interface DeleteDeploymentResponse {
  /** UUID of the deleted deployment. */
  id: string;
}

// ============================================================================
// Statistics
// ============================================================================

/** One conversation session counted by `client.deployments.getStatistics()`. */
export interface DeploymentStatsSession {
  /** Session UUID. */
  id: string;
  /** UUID of the first chat on this session, or `null` when it has none. */
  chatId: string | null;
  /** Messages exchanged on this session. */
  messageCount: number;
  /** ISO 8601 last-activity timestamp. */
  updatedAt: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/**
 * Response from `client.deployments.getStatistics()`.
 *
 * The server reads at most 500 sessions, so `totalSessions` is the length of
 * `sessions` rather than a true count for a busy deployment.
 */
export interface DeploymentStats {
  /** Number of sessions in `sessions`. */
  totalSessions: number;
  /** Messages summed across `sessions`. */
  totalMessages: number;
  /** The sessions themselves, newest first. */
  sessions: DeploymentStatsSession[];
}

// ============================================================================
// Embed config
// ============================================================================

/**
 * Response from `client.deployments.getEmbedConfig()` and
 * `updateEmbedConfig()`. Every field is `null` rather than absent when unset,
 * and `updateEmbedConfig` returns the whole merged config, not just the patch.
 */
export interface EmbedConfig {
  /** Widget theme name. */
  theme: string | null;
  /** Brand colour, as a CSS colour string. */
  primaryColor: string | null;
  /** Where the launcher sits on the page. */
  position: string | null;
  /** Message the widget opens with. */
  initialMessage: string | null;
  /** Prompt chips offered to the visitor. */
  suggestedMessages: string[] | null;
  /** URL of the logo shown in the widget header. */
  logoUrl: string | null;
  /** URL of the agent avatar. */
  avatarUrl: string | null;
  /** Text shown in the widget header. */
  headerTitle: string | null;
}

// ============================================================================
// Request bodies and params
// ============================================================================

/** Query parameters accepted by `client.deployments.list()`. */
export interface ListDeploymentsParams {
  /** Page number (1-based). */
  page?: number;
  /** Items per page. */
  limit?: number;
  /** Free-text filter on the deployment name. */
  search?: string;
  /** Restrict to one channel. */
  type?: DeploymentType;
  /** Restrict to active or inactive deployments. */
  isActive?: boolean;
}

/** Request body for `client.deployments.create()`. */
export interface CreateDeploymentBody {
  /** Deployment display name (required). */
  name: string;
  /** Channel to publish to (required). */
  type: DeploymentType;
  /** UUID of the agent to serve. */
  agentId?: string;
  /** Free-text description. */
  description?: string;
  /** Channel-specific settings. Shape depends on `type`. */
  settings?: Record<string, unknown>;
}

/** Request body for `client.deployments.update()`. All fields are optional. */
export interface UpdateDeploymentBody {
  /** New display name. */
  name?: string;
  /** New description. Set to `null` to clear it. */
  description?: string | null;
  /** New agent UUID. Set to `null` to unassign. */
  agentId?: string | null;
  /** Channel-specific settings to merge. */
  settings?: Record<string, unknown>;
  /** Whether the deployment serves traffic. */
  isActive?: boolean;
}

/** Request body for `client.deployments.updateEmbedConfig()`. All fields are optional. */
export interface UpdateEmbedConfigBody {
  /** Widget theme name. */
  theme?: string;
  /** Brand colour, as a CSS colour string. */
  primaryColor?: string;
  /** Where the launcher sits on the page. */
  position?: string;
  /** Message the widget opens with. */
  initialMessage?: string;
  /** Prompt chips offered to the visitor. */
  suggestedMessages?: string[];
  /** URL of the logo shown in the widget header. */
  logoUrl?: string;
  /** URL of the agent avatar. */
  avatarUrl?: string;
  /** Text shown in the widget header. */
  headerTitle?: string;
}
