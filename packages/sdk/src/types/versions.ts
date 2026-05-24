import type { VersionType } from "./common";

// ============================================================================
// Version creator
// ============================================================================

/** The user who created a prompt version. */
export interface VersionCreator {
  /** User UUID. */
  id: string;
  /** User's first name. */
  firstName: string | null;
  /** User's last name. */
  lastName: string | null;
}

// ============================================================================
// Version Summary (list endpoint)
// ============================================================================

/** Prompt version summary returned by `client.agents.versions.list()`. */
export interface VersionSummary {
  /** Unique version UUID. */
  id: string;
  /** Version type: `"AUTO"` (created on prompt changes) or `"CHECKPOINT"` (manually named snapshot). */
  type: VersionType;
  /** Version name (only set for checkpoints). */
  name: string | null;
  /** Version description. */
  description: string | null;
  /** Whether this version is currently deployed to production. */
  isProduction: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** User UUID who created this version. */
  createdBy: string | null;
  /** Creator's name details. */
  creator: VersionCreator | null;
}

// ============================================================================
// Version Detail (get endpoint — extends summary)
// ============================================================================

/** Full version detail including the prompt content. Returned by `client.agents.versions.get()`. */
export interface VersionDetail extends VersionSummary {
  /** The full agent system prompt at this version, in markdown format. */
  prompt: string | null;
}

// ============================================================================
// Query params
// ============================================================================

/** Query parameters for `client.agents.versions.list()`. */
export interface ListVersionsParams {
  /** Page number (1-based, default 1). */
  page?: number;
  /** Items per page (default 20). */
  limit?: number;
  /** Filter by version type. */
  type?: VersionType;
}

// ============================================================================
// Request bodies
// ============================================================================

/** Request body for `client.agents.versions.createCheckpoint()`. */
export interface CreateCheckpointBody {
  /** Checkpoint name (e.g. "v1.0", "before-refactor"). */
  name?: string;
  /** Description of what this checkpoint captures. */
  description?: string;
  /** Agent prompt in markdown format. When provided, updates the agent's draft prompt AND creates a checkpoint of it. */
  prompt?: string;
  /** Auto-publish this version. Defaults to `true` if the agent has no published version, `false` otherwise. */
  autoPublish?: boolean;
}

/** Request body for `client.agents.versions.update()`. */
export interface UpdateVersionBody {
  /** New version name. */
  name?: string;
  /** New version description. */
  description?: string;
}

// ============================================================================
// Restore response
// ============================================================================

/** Response from `client.agents.versions.restore()`. */
export interface RestoreVersionResponse {
  /** The restored prompt content. */
  prompt: string | null;
  /** Confirmation message. */
  message: string;
}
