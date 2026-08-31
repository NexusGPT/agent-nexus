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
 * Whether a further page exists — including the case where nobody knows.
 *
 * A boolean cannot carry three answers, and the third one is real: several v1
 * list routes publish no `hasMore` at all. Collapsing that absence to `false`
 * tells a paging loop it is finished when the server merely declined to say, so
 * the loop stops on page one and the caller reads a truncated collection as a
 * complete one. Nothing in the payload distinguishes the two.
 *
 * The three states are a union rather than an optional boolean because
 * `meta.hasMore ?? false` compiles, reads as prudence, and reinstates exactly
 * the collapse this type exists to prevent. A caller must name `"did-not-say"`
 * to act on it, and `Record<PagingState, T>` gives exhaustiveness for free.
 *
 * - `"has-more"`   — a further page exists.
 * - `"exhausted"`  — this is the last page.
 * - `"did-not-say"` — the server published nothing about further pages. NOT a
 *   synonym for `"exhausted"`: page against `total`, or request the next page
 *   and see, but do not conclude the walk is over.
 */
export type PagingState = "has-more" | "exhausted" | "did-not-say";

/** Every {@link PagingState}, for exhaustive iteration. */
export const PAGING_STATES = ["has-more", "exhausted", "did-not-say"] as const;

/**
 * Pagination metadata returned alongside list results.
 *
 * EVERY COUNT HERE IS OPTIONAL AND ABSENCE IS THE POINT. A field is present
 * when the server published it and missing when it did not — never filled in
 * from the page the SDK happens to be holding. `total: data.length` is the page
 * size wearing a population's name, and `page: 1` on a payload that carried no
 * page number claims a position the SDK cannot know.
 *
 * `paging` is the one required field, because a caller that pages MUST confront
 * whether the walk is over. See {@link PagingState}.
 */
export interface PaginationMeta {
  /**
   * Items across all pages — present ONLY when the server published one.
   * Absent means unknown; it never means zero and never means `data.length`.
   */
  total?: number;
  /** Current page number (1-based), when the server reports it. */
  page?: number;
  /** Whether a further page exists, or that the server did not say. */
  paging: PagingState;
  /** Items requested per page, when the endpoint reports it. */
  limit?: number;
  /** Total number of pages, when the endpoint reports it. */
  totalPages?: number;
}

/**
 * Pagination metadata exactly as the server sent it, before normalization.
 *
 * This is what comes off the wire, and every field is optional because every
 * one of them is omitted by some v1 route. {@link PaginationMeta} — the
 * normalized shape — is what {@link PageResponse} carries, and
 * `HttpClient.requestPage` is what turns one into the other.
 *
 * The two types stay separate so the normalizer has somewhere to put an
 * absence. Declaring them as one is what let a field the server never sends be
 * typed as always present.
 */
export interface WirePaginationMeta {
  /** Items across all pages. Absent where the server publishes no count. */
  total?: number;
  /** Current page number (1-based), where the server echoes it. */
  page?: number;
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
export type ModelProvider = "OPEN_AI" | "ANTHROPIC" | "GOOGLE_AI" | "KIMI";

/**
 * Model configuration — the modern way to set an agent's model.
 *
 * Use `client.models.list()` to get available models. The `modelId` from the
 * response goes into `modelName`, and `provider` goes into `modelProvider`.
 */
export interface ModelConfig {
  /** Model ID from the catalog (e.g. "claude-sonnet-4-6", "gpt-4.1"). */
  modelName: string;
  /** Provider: "OPEN_AI", "ANTHROPIC", "GOOGLE_AI", or "KIMI". */
  modelProvider: ModelProvider;
  /**
   * Anthropic thinking level.
   *
   * Two vocabularies, and both are accepted on every model — the platform maps
   * a legacy value onto an adaptive model and back:
   *
   * - legacy (Claude 4.6 and earlier): `"fast"`, `"detailed"`, `"extended"`.
   * - adaptive (Claude 4.7+): `"low"`, `"medium"`, `"high"`, `"xhigh"`, `"max"`.
   *
   * This type offered the legacy three only, matching a v1 contract that had
   * drifted from the platform's own shape, so an adaptive level was a 400 on
   * `agents.create` and `agents.update` and unrepresentable on `AgentDetail`
   * (NEX-3869).
   */
  thinkingLevel?: "fast" | "detailed" | "extended" | "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Anthropic adaptive thinking display mode — whether the model's thinking is
   * summarized back to you or withheld. Anthropic-only; ignored elsewhere.
   */
  thinkingDisplay?: "summarized" | "omitted";
  /** OpenAI reasoning effort: "low", "medium", "high", "xhigh". */
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  /** Google AI thinking level: "dynamic", "minimal", "low", "medium", "high". */
  geminiThinkingLevel?: "dynamic" | "minimal" | "low" | "medium" | "high";
  /** Kimi reasoning effort: "low", "high", or "max". Fixed for the conversation. */
  kimiReasoningEffort?: "low" | "high" | "max";
  /** Sampling temperature (0-1). */
  temperature?: number;
  /**
   * Id of a custom model this organization owns (BYOM), from
   * `client.customModels.list()`.
   *
   * A custom model is selected by THIS id. `modelProvider` admits the four
   * platform values only — `client.models.list()` reports `CUSTOM_<PROTOCOL>`
   * on a custom row to say where it came from, not as a value to send back.
   * Keep `modelName` / `modelProvider` set to the platform model to fall back
   * to; they are required and are what runs when no custom model is attached.
   */
  customModelId?: string;
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
 * The type of tool configuration attached to an agent, as READ back.
 *
 * - `"PLUGIN"` — Pipedream marketplace tool (external API integration).
 * - `"WORKFLOW"` — An organization-owned automation workflow.
 * - `"TASK"` — An organization-owned AI task.
 * - `"COLLECTION"` — A knowledge collection the agent can query.
 * - `"DOCUMENT_TEMPLATE"` — A document generation template.
 * - `"MEMORY"` — An agent memory store. **Readable, never creatable through v1** —
 *   see {@link WritableAgentToolConfigType}.
 *
 * 🔴 THIS IS THE WIDE, READ-SIDE SET AND IT MUST STAY WIDE. A stored row of any
 * type has to be readable, so narrowing this to match what a caller may WRITE
 * would type an existing row out of existence — the response would carry a value
 * the type says cannot occur, and every consumer's exhaustive switch would miss it
 * silently. The write narrowing is a separate type, derived below.
 */
export type AgentToolConfigType =
  | "WORKFLOW"
  | "PLUGIN"
  | "TASK"
  | "COLLECTION"
  | "DOCUMENT_TEMPLATE"
  | "MEMORY";

/**
 * The subset of {@link AgentToolConfigType} a caller may SEND on a create or update
 * body.
 *
 * 🔴 DERIVED BY EXCLUSION, NEVER RESTATED AS A SECOND LIST, AND THAT MIRRORS THE
 * CONTRACT: `WritableAgentToolConfigTypeSchema = AgentToolConfigTypeSchema.exclude(...)`.
 * A hand-written second list is a copy that drifts from the first the day a member is
 * added; deriving it means a new READ member flows here automatically, and only a change
 * to the EXCLUSION is a decision anyone has to make.
 *
 * `MEMORY` is excluded because a MEMORY row is inert if created through v1 — publishing
 * it as creatable would advertise a capability the API does not have.
 */
export type WritableAgentToolConfigType = Exclude<AgentToolConfigType, "MEMORY">;

/** Prompt version type. `"AUTO"` versions are created automatically on prompt changes; `"CHECKPOINT"` versions are manually named snapshots. */
export type VersionType = "AUTO" | "CHECKPOINT";
