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

/**
 * Pagination metadata returned alongside list results.
 *
 * `limit` and `totalPages` are optional because not every list endpoint emits
 * them — but where the server does send them they were previously unnameable,
 * so a caller could read `meta.total` and not `meta.totalPages` for no reason
 * anyone chose.
 *
 * `hasMore` is REQUIRED and is guaranteed by {@link HttpClient.requestPage},
 * which derives it when the server omits it. Six v1 list endpoints — agents,
 * conversations, phone numbers, tickets, versions and workflows — send
 * `{ total, page, limit, totalPages }` with no `hasMore` at all, so before that
 * derivation `client.agents.list()` returned a `meta.hasMore` typed `boolean`
 * and `undefined` at runtime.
 */
export interface PaginationMeta {
  /** Total number of items across all pages. */
  total: number;
  /** Current page number (1-based). */
  page: number;
  /** Whether more pages exist after the current one. */
  hasMore: boolean;
  /** Items requested per page, when the endpoint reports it. */
  limit?: number;
  /** Total number of pages, when the endpoint reports it. */
  totalPages?: number;
}

/**
 * Pagination metadata exactly as the server sent it, before normalization.
 *
 * This is what comes off the wire: `hasMore` is OPTIONAL here because six v1
 * list endpoints do not send it. {@link PaginationMeta} — the normalized shape —
 * is what {@link PageResponse} carries, and `HttpClient.requestPage` is what
 * turns one into the other. Declaring them as one type is what let a field the
 * server never sends be typed as always present.
 */
export interface WirePaginationMeta {
  /** Total number of items across all pages. */
  total: number;
  /** Current page number (1-based). */
  page: number;
  /** Whether more pages exist. Absent on several v1 list endpoints. */
  hasMore?: boolean;
  /** Items requested per page, when the endpoint reports it. */
  limit?: number;
  /** Total number of pages, when the endpoint reports it. */
  totalPages?: number;
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
