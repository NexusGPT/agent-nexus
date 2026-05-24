// ============================================================================
// Pagination
// ============================================================================

/** Pagination query parameters accepted by list endpoints. */
export interface PaginationParams {
  /** Page number (1-based). */
  page?: number;
  /** Items per page. */
  limit?: number;
}

/** Pagination metadata returned alongside list results. */
export interface PaginationMeta {
  /** Total number of items across all pages. */
  total: number;
  /** Current page number (1-based). */
  page: number;
  /** Whether more pages exist after the current one. */
  hasMore: boolean;
}

/** Paginated response wrapper returned by list methods. */
export interface PageResponse<T> {
  /** Items on the current page. */
  data: T[];
  /** Pagination metadata. */
  meta: PaginationMeta;
}

// ============================================================================
// Delete response
// ============================================================================

/** Response returned after successfully deleting a resource. */
export interface DeleteResponse {
  /** ID of the deleted resource. */
  id: string;
  /** Always `true` on successful deletion. */
  deleted: true;
}

// ============================================================================
// Enums (as union types)
// ============================================================================

/** Agent lifecycle status. `"ACTIVE"` agents are deployed; `"DRAFT"` agents are in development. */
export type AgentStatus = "ACTIVE" | "DRAFT";

/** Model provider. */
export type ModelProvider = "OPEN_AI" | "ANTHROPIC" | "GOOGLE_AI";

/**
 * Model configuration — the modern way to set an agent's model.
 *
 * Use `client.models.list()` to get available models. The `modelId` from the
 * response goes into `modelName`, and `provider` goes into `modelProvider`.
 */
export interface ModelConfig {
  /** Model ID from the catalog (e.g. "claude-sonnet-4-6", "gpt-4.1"). */
  modelName: string;
  /** Provider: "OPEN_AI", "ANTHROPIC", or "GOOGLE_AI". */
  modelProvider: ModelProvider;
  /** Anthropic thinking level: "fast", "detailed", or "extended". */
  thinkingLevel?: "fast" | "detailed" | "extended";
  /** OpenAI reasoning effort: "low", "medium", "high", "xhigh". */
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  /** Google AI thinking level: "dynamic", "minimal", "low", "medium", "high". */
  geminiThinkingLevel?: "dynamic" | "minimal" | "low" | "medium" | "high";
  /** Sampling temperature (0-1). */
  temperature?: number;
}

/**
 * Valid agent model identifiers. These map to the `AgentModel` Prisma enum.
 *
 * Use `client.models.list()` to retrieve all enabled models from the database
 * with their display names, providers, and capabilities.
 */
export type AgentModel =
  | "DEFAULT"
  | "GPT_4_TURBO"
  | "GPT_4"
  | "GPT_4_5"
  | "GPT_4_1"
  | "GPT_4_1_MINI"
  | "GPT_4_1_NANO"
  | "GPT_3_5_TURBO"
  | "GPT_3_5_TURBO_16K"
  | "MISTRAL_LARGE"
  | "OPENAI_O1"
  | "OPENAI_O1_MINI"
  | "OPENAI_O3_MINI"
  | "OPENAI_O3"
  | "OPENAI_O3_PRO"
  | "OPENAI_O4_MINI";

/**
 * The type of tool configuration attached to an agent.
 *
 * - `"PLUGIN"` — Pipedream marketplace tool (external API integration).
 * - `"WORKFLOW"` — An organization-owned automation workflow.
 * - `"TASK"` — An organization-owned AI task.
 * - `"COLLECTION"` — A knowledge collection the agent can query.
 * - `"DOCUMENT_TEMPLATE"` — A document generation template.
 */
export type AgentToolConfigType =
  | "WORKFLOW"
  | "PLUGIN"
  | "TASK"
  | "COLLECTION"
  | "DOCUMENT_TEMPLATE";

/** Prompt version type. `"AUTO"` versions are created automatically on prompt changes; `"CHECKPOINT"` versions are manually named snapshots. */
export type VersionType = "AUTO" | "CHECKPOINT";
