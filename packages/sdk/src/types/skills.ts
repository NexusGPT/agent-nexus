import type { FolderRef } from "./workflows";

// ============================================================================
// SHARED
// ============================================================================

/** Common query parameters for all skills list endpoints. */
export interface ListSkillsCommonParams {
  /** Free-text search within names and descriptions. */
  search?: string;
  /** Max results to return (default 20, max 100). */
  limit?: number;
  /** Offset for pagination (default 0). */
  offset?: number;
  /**
   * Filter to skills in a folder, by folder id or name (case-insensitive).
   * Applies to list endpoints that support folders (workflows, AI tasks).
   */
  folder?: string;
}

// ============================================================================
// WORKFLOW
// ============================================================================

/** A workflow (automation) that can be attached to an agent as a WORKFLOW tool. */
export interface WorkflowSummary {
  /** Unique workflow ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Description of what the workflow does. */
  description: string | null;
  /** Workflow status: "DRAFT", "PUBLISHED", or "ARCHIVED". */
  status: string;
  /** Trigger type: "AGENT", "WEBHOOK", "SCHEDULE", or "UNDETERMINED". */
  triggerType: string;
  /** URL to the workflow's icon, if any. */
  iconUrl: string | null;
  /**
   * JSON Schema describing the input the agent must provide when triggering
   * this workflow. `null` if the workflow takes no structured input.
   */
  agentInputSchema: unknown | null;
  /** Folder the workflow belongs to, or `null` if unassigned. */
  folder: FolderRef | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
}

/** Response from `client.skills.listWorkflows()`. */
export interface ListWorkflowsResponse {
  /** Matching workflows (paginated). */
  items: WorkflowSummary[];
  /** Total number of matching workflows. */
  total: number;
}

// ============================================================================
// AI TASK
// ============================================================================

/** An AI task summary (list view). */
export interface TaskSummary {
  /** Unique task ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Description of what the task does. */
  description: string | null;
  /** Task category (e.g. "GENERATION", "CLASSIFICATION", "EXTRACTION"). */
  category: string;
  /** Input format: "TEXT" or "JSON". */
  inputFormat: string;
  /** Output format: "TEXT", "JSON", or "TEMPLATE". */
  outputFormat: string;
  /** Model provider (e.g. "openai", "anthropic"). */
  modelProvider: string;
  /** Model name (e.g. "gpt-4o"). */
  modelName: string;
  /** Folder the task belongs to, or `null` if unassigned. */
  folder: FolderRef | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
}

/**
 * Provider tuning stored alongside the model choice on an AI task.
 *
 * Each knob belongs to one provider, so a task carries at most the ones its
 * provider understands and the rest are absent. A field you never set on
 * create or update is absent here too — with one exception: `temperature`
 * carries a server-side default of `0.7`, so a task created without one still
 * reports it.
 */
export interface TaskModelTuning {
  /** Sampling temperature, 0–1. Defaults to 0.7 at create time. */
  temperature?: number;
  /**
   * Anthropic thinking level. `"fast" | "detailed" | "extended"` on legacy
   * models; `"low" | "medium" | "high" | "xhigh" | "max"` on adaptive ones.
   */
  thinkingLevel?: string;
  /** Anthropic adaptive thinking display mode. */
  thinkingDisplay?: string;
  /** OpenAI reasoning effort. Which values a model accepts varies by model. */
  reasoningEffort?: string;
  /** Google AI thinking level. */
  geminiThinkingLevel?: string;
  /** Kimi reasoning effort. Its value set differs from OpenAI's — not interchangeable. */
  kimiReasoningEffort?: string;
  /**
   * Id of the custom model (BYOM) this task runs on, when one is attached.
   *
   * Not provider tuning — it SELECTS the endpoint, and it is read in preference
   * to `modelName` / `modelProvider`, which stay populated as the platform
   * fallback. Absent when the task runs a platform model.
   */
  customModelId?: string;
}

/** Full AI task detail (extends summary with schemas and model tuning). */
export interface TaskDetail extends TaskSummary, TaskModelTuning {
  /** Task prompt template. `null` if not set. */
  prompt: string | null;
  /**
   * JSON Schema describing the structured input when `inputFormat === "JSON"`.
   * `null` for text-only input tasks.
   */
  jsonInputSchema: unknown | null;
  /**
   * JSON Schema describing the structured output when `outputFormat === "JSON"`.
   * `null` for text/template output tasks.
   */
  jsonOutputSchema: unknown | null;
  /** Whether the task supports multimodal (image) input. */
  multimodal: boolean;
  /**
   * Document template ID when `outputFormat === "TEMPLATE"`.
   * `null` otherwise.
   */
  documentTemplateId: string | null;
}

/**
 * Result of `client.skills.updateTask()`. The task detail plus the version
 * snapshot taken alongside the edit, so the caller can surface it or roll back
 * to it. Both fields are `null` for a no-op update, which creates no version.
 */
export interface UpdateTaskResult extends TaskDetail {
  /** Id of the version snapshotted by this update. `null` if nothing changed. */
  versionId: string | null;
  /** ISO 8601 timestamp of that snapshot. `null` if nothing changed. */
  versionCreatedAt: string | null;
}

/** Response from `client.skills.listTasks()`. */
export interface ListTasksResponse {
  /** Matching AI tasks (paginated). */
  items: TaskSummary[];
  /** Total number of matching tasks. */
  total: number;
}

// ============================================================================
// COLLECTION
// ============================================================================

/** A knowledge collection summary (list view). */
export interface CollectionSummary {
  /** Unique collection ID. */
  id: string;
  /** Internal name. */
  name: string;
  /** Human-readable display name. */
  displayName: string | null;
  /** Description of the collection's contents. */
  description: string | null;
  /** Number of documents in the collection. */
  documentCount: number;
  /** Whether the collection is active. */
  isActive: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
}

/** Full collection detail (extends summary with retrieval settings). */
export interface CollectionDetail extends CollectionSummary {
  /** Number of chunks to retrieve per query. */
  k: number;
  /** Reranker model name, if configured. */
  reranker: string | null;
  /** Whether to use precise (exact) responses vs. generative answers. */
  preciseResponses: boolean;
  /** Whether to include document metadata in retrieval results. */
  includeMetadata: boolean;
}

/** Response from `client.skills.listCollections()`. */
export interface ListCollectionsResponse {
  /** Matching collections (paginated). */
  items: CollectionSummary[];
  /** Total number of matching collections. */
  total: number;
}

// ============================================================================
// DOCUMENT TEMPLATE
// ============================================================================

/** A document template summary (list view). */
export interface DocumentTemplateSummary {
  /** Unique template ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Description of the template. */
  description: string | null;
  /** Template type: "WORD_FORMAT", "WORD_TEMPLATE", "POWERPOINT_TEMPLATE", etc. */
  type: string;
  /** Template status: "DRAFT" or "SAVED". */
  status: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
}

/** Full document template detail (extends summary with input schema). */
export interface DocumentTemplateDetail extends DocumentTemplateSummary {
  /** JSON schema describing the inputs needed to generate a document. */
  inputFormat: unknown | null;
  /** Per-slide input formats (for presentation templates). */
  slidesInputFormat: unknown[];
  /** URL to download the template file. */
  fileUrl: string | null;
  /** URL to preview the template. */
  previewFileUrl: string | null;
}

/** Response from `client.skills.listDocumentTemplates()`. */
export interface ListDocumentTemplatesResponse {
  /** Matching document templates (paginated). */
  items: DocumentTemplateSummary[];
  /** Total number of matching templates. */
  total: number;
}

// ============================================================================
// CREATE BODIES
// ============================================================================

/** Body for `client.skills.createDocumentTemplate()`. */
export interface CreateDocumentTemplateBody {
  /** Display name. */
  name: string;
  /** Description of the template. */
  description?: string;
  /** Template type. */
  type: "WORD_FORMAT" | "WORD_TEMPLATE" | "WORD_CONTENT" | "POWERPOINT_TEMPLATE" | "EXCEL_TEMPLATE";
}

/** Body for `client.skills.createTask()`. */
export interface CreateTaskBody {
  /** Display name. */
  name: string;
  /** Description of the task. */
  description?: string;
  /** Model name (must be a valid AI_MODELS key). */
  modelName: string;
  /** Model provider. */
  modelProvider: "OPEN_AI" | "ANTHROPIC" | "GOOGLE_AI" | "KIMI";
  /**
   * Id of a custom model this organization owns (BYOM). An id that is not this
   * organization's is a 404 on this call, never a 403.
   *
   * `modelName` / `modelProvider` stay REQUIRED beside it and are not
   * redundant: they are the platform fallback, and a stored config missing
   * either is discarded whole at inference — the custom model with it.
   */
  customModelId?: string;
  /** Prompt template. */
  prompt?: string;
  /** Temperature (0-2, default 0.7). */
  temperature?: number;
  /** Input format (default "text"). */
  inputFormat?: "text" | "json";
  /** Output format (default "text"). */
  outputFormat?: "text" | "json" | "template";
  /** Generation-specific settings (required). */
  generation: {
    /** Whether the task supports multimodal input. */
    multimodal?: boolean;
    /** Expected input description (required when inputFormat is "text"). */
    expectedInput?: string;
    /** JSON input schema (required when inputFormat is "json"). */
    jsonInputSchema?: unknown;
    /** Expected output description (required when outputFormat is "text"). */
    expectedOutput?: string;
    /** JSON output schema (required when outputFormat is "json"). */
    jsonOutputSchema?: unknown;
    /** Document template ID (required when outputFormat is "template"). */
    documentTemplateId?: string;
  };
}

/** Body for `client.skills.updateTask()`. All fields are optional. */
export interface UpdateTaskBody {
  name?: string;
  description?: string;
  modelName?: string;
  modelProvider?: "OPEN_AI" | "ANTHROPIC" | "GOOGLE_AI" | "KIMI";
  /**
   * Attach a custom model (BYOM). Sending `modelName` or `modelProvider`
   * WITHOUT this field detaches the one already stored — that is how a task is
   * put back on a platform model.
   */
  customModelId?: string;
  prompt?: string;
  temperature?: number;
  inputFormat?: "text" | "json";
  outputFormat?: "text" | "json" | "template";
  generation?: {
    multimodal?: boolean;
    expectedInput?: string;
    jsonInputSchema?: unknown;
    expectedOutput?: string;
    jsonOutputSchema?: unknown;
    documentTemplateId?: string;
  };
}

// ============================================================================
// EXECUTION BODIES & RESPONSES
// ============================================================================

/** Body for `client.skills.generateDocumentTemplate()`. */
export interface GenerateDocumentTemplateBody {
  /** Template variables to fill in. */
  variables: Record<string, unknown>;
}

/** Response from `client.skills.generateDocumentTemplate()`. */
export interface GenerateDocumentTemplateResponse {
  /** URL to the generated document. */
  url: string;
}

/** Body for `client.skills.executeTask()`. */
export interface ExecuteTaskBody {
  /** Input to the task — text string or structured JSON object. */
  input: string | Record<string, unknown>;
}

/** Response from `client.skills.executeTask()`. */
export interface ExecuteTaskResponse {
  /** Task output. */
  output: unknown;
  /** Output type (e.g. "TEXT", "JSON", "TEMPLATE"). */
  outputType: string;
}

// ============================================================================
// EXTERNAL TOOL (CUSTOM_MANIFEST)
// ============================================================================

/** An external tool (CUSTOM_MANIFEST) detail. */
export interface ExternalToolDetail {
  /** Unique external tool ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Description. */
  description: string | null;
  /** URL to the tool's logo/icon image. */
  imageUrl: string | null;
  /** Free-text usage notes shown alongside the tool. */
  documentation: string | null;
  /** Always "CUSTOM_MANIFEST". */
  type: "CUSTOM_MANIFEST";
  /** Base endpoint URL. */
  endpointUrl: string | null;
  /** Status (e.g. "PUBLISHED"). */
  status: string;
  /** Number of actions extracted from the OpenAPI spec. */
  actionsCount: number;
  /** Auth type (e.g. "none", "service_http", "oauth"). */
  authType: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Response from `client.skills.listExternalTools()`. */
export interface ListExternalToolsResponse {
  /** Matching external tools (paginated). */
  items: ExternalToolDetail[];
  /** Total number of matching external tools. */
  total: number;
}

/** Auth configuration for external tools (discriminated union on `type`). */
export type ExternalToolAuth =
  | { type: "none" }
  | {
      type: "service_http";
      apiKey: string;
      authorization_type: "basic" | "bearer" | "custom";
      custom_header_name?: string;
      custom_header_prefix?: string;
    }
  | {
      type: "user_http";
      authorization_type: "basic" | "bearer" | "custom";
      custom_header_name?: string;
      custom_header_prefix?: string;
    }
  | {
      type: "oauth";
      grant_type: string;
      client_id: string;
      client_secret: string;
      client_url: string;
      authorization_url: string;
      scope?: string;
      extra_body_params?: Record<string, string>;
      tokenExchangeMethod?: string;
    }
  | {
      type: "user_oauth";
      grant_type: string;
      authorization_type?: "basic" | "bearer" | "custom";
      custom_header_name?: string;
      custom_header_prefix?: string;
    }
  | { type: "keys" };

/** Body for `client.skills.createExternalTool()`. */
export interface CreateExternalToolBody {
  /** Display name. */
  name: string;
  /** Description. */
  description?: string;
  /** URL to the tool's logo/icon image (square PNG or SVG recommended). */
  imageUrl?: string;
  /** OpenAPI spec as a JSON or YAML string. */
  openApiSpec: string;
  /** Base endpoint URL. */
  endpointUrl: string;
  /** Auth configuration. */
  auth: ExternalToolAuth;
}

/** Body for `client.skills.updateExternalTool()`. All fields are optional. */
export interface UpdateExternalToolBody {
  name?: string;
  description?: string | null;
  documentation?: string | null;
  openApiSpec?: string;
  endpointUrl?: string;
  auth?: ExternalToolAuth;
}

/** Response from `client.skills.deleteExternalTool()`. */
export interface DeleteExternalToolResponse {
  deleted: true;
}

/** Response from `client.skills.deleteTask()`. */
export interface DeleteTaskResponse {
  id: string;
  deleted: true;
}

// ============================================================================
// CREATE BODIES (continued)
// ============================================================================

// ============================================================================
// TEST EXTERNAL TOOL
// ============================================================================

/** Body for `client.skills.testExternalTool()`. */
export interface TestExternalToolBody {
  /** Which action (operationId) to call. */
  operationId: string;
  /** Flat key-value input parameters. */
  input: Record<string, unknown>;
  /** Optional stored credential ID for auth. */
  toolCredentialId?: string;
}

/** Response from `client.skills.initiateClientCredentials()`. */
export interface InitiateClientCredentialsResponse {
  success: boolean;
  credentialId: string;
}

/** Response from `client.skills.testExternalTool()`. */
export interface TestExternalToolResponse {
  /** Whether the execution succeeded or failed. */
  status: "success" | "error";
  /** Execution output (null on error). */
  output: unknown;
  /** Error message when status is "error". */
  error?: string;
  /** How long the execution took in milliseconds. */
  executionTimeMs: number;
}

// ============================================================================
// CREATE BODIES (continued)
// ============================================================================

/** Body for `client.skills.createCollection()`. */
export interface CreateCollectionBody {
  /** Internal name (unique per org). */
  name: string;
  /** Human-readable display name. */
  displayName?: string;
  /** Description of the collection. */
  description?: string;
  /** Number of chunks to retrieve per query (default 10). */
  k?: number;
  /** Reranker model name. */
  reranker?: string;
  /** Whether to use precise responses (default false). */
  preciseResponses?: boolean;
  /** Whether to include metadata (default false). */
  includeMetadata?: boolean;
}

// ============================================================================
// Collection documents
// ============================================================================

/** One row of `client.skills.listCollectionDocuments()`. */
export interface CollectionDocument {
  /** Document UUID. */
  id: string;
  /** Document name. */
  name: string;
  /** Document type discriminator. */
  type: string;
  /** Processing status. */
  status: string;
  /** Where the document came from, or `null` for a direct upload. */
  sourceType: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/**
 * Response from `client.skills.listCollectionDocuments()`.
 *
 * This is NOT a `PageResponse`. Every other paginated v1 route hands
 * `createApiSuccess` the page and its meta as two arguments, so `meta` lands on
 * the envelope; this one hands over the whole `{ data, meta }` object, so the
 * page envelope arrives nested INSIDE `data` and the response carries no
 * top-level `meta` at all. Reading it with `requestPage` produced a
 * `PageResponse` whose `data` was an object and whose `meta.total` was
 * `undefined`. The type says what the wire says; flattening it is a public API
 * change, not an SDK one.
 */
export interface ListCollectionDocumentsResponse {
  /** The documents on this page. */
  data: CollectionDocument[];
  /** Pagination metadata, nested here rather than on the envelope. */
  meta: {
    /** Total documents in the collection. */
    total: number;
    /** Current page number (1-based). */
    page: number;
    /** Items per page. */
    limit: number;
    /** Total number of pages. */
    totalPages: number;
    /** Whether more pages exist after the current one. */
    hasMore: boolean;
  };
}

/**
 * Response from `client.skills.removeCollectionDocument()`.
 *
 * Idempotent: removing a document that is not in the collection still reports
 * `removed: true`.
 */
export interface RemoveCollectionDocumentResponse {
  /** Collection UUID. */
  collectionId: string;
  /** Document UUID. */
  documentId: string;
  /** Always `true`. */
  removed: true;
}

/** Response from `client.skills.getCollectionStatistics()`. */
export interface CollectionStatistics {
  /** Documents in the collection. */
  documentCount: number;
  /** Combined size of those documents, in bytes. */
  totalSizeBytes: number;
  /** Documents that finished embedding. */
  embeddedCount: number;
  /** Documents still waiting to embed. */
  pendingCount: number;
  /** ISO 8601 timestamp of the most recent change, or `null` when empty. */
  lastUpdatedAt: string | null;
}

/** Response from `client.skills.deleteCollection()`. */
export interface DeleteCollectionResponse {
  /** UUID of the deleted collection. */
  id: string;
  /** Always `true` on success. */
  deleted: true;
}

// ============================================================================
// Collection search and query
// ============================================================================

/**
 * One hit from `client.skills.searchCollection()` or `searchMultipleCollections()`.
 *
 * This searches document NAMES, not contents — `text` is the matched name and
 * `score` is the constant 1, not a relevance ranking. Use `queryCollection()`
 * for content retrieval with real scores.
 */
export interface CollectionSearchResult {
  /** The matched document name. */
  text: string;
  /** Always 1. This endpoint does not rank. */
  score: number;
  /** UUID of the matched document. */
  documentId: string;
  /** Name of the matched document. */
  documentName: string;
  /**
   * Search metadata stored on the document, or `null`.
   *
   * Always `null` from `searchMultipleCollections()`, which has no
   * `includeMetadata` option to turn it on.
   */
  metadata: unknown;
}

/** Response from `client.skills.searchCollection()` and `searchMultipleCollections()`. */
export interface CollectionSearchResponse {
  /** The matched documents. */
  results: CollectionSearchResult[];
}

/** One hit from `client.skills.queryCollection()`. */
export interface CollectionQueryResult {
  /** The matched content snippet. */
  content: string;
  /** Relevance score. */
  score: number;
  /** UUID of the source document, when the index carries one. */
  documentId?: string;
  /** Search metadata, or `null` unless `includeMetadata` was set. */
  metadata: unknown;
}

/** Response from `client.skills.queryCollection()`. */
export interface CollectionQueryResponse {
  /** The matched snippets, most relevant first. */
  results: CollectionQueryResult[];
}

// ============================================================================
// Collection request bodies
// ============================================================================

/** Request body for `client.skills.searchCollection()`. */
export interface SearchCollectionBody {
  /** Text to match against document names. */
  query: string;
  /** Maximum hits to return. */
  limit?: number;
  /** Include each document's stored search metadata. */
  includeMetadata?: boolean;
}

/** Request body for `client.skills.queryCollection()`. */
export interface QueryCollectionBody {
  /** Text to match against document contents. */
  query: string;
  /** Maximum hits to return. */
  limit?: number;
  /** Include each hit's stored search metadata. */
  includeMetadata?: boolean;
  /** Restrict hits to documents whose metadata matches these values. */
  metadataFilter?: Record<string, string | string[]>;
}

/** Request body for `client.skills.searchMultipleCollections()`. */
export interface SearchMultipleCollectionsBody {
  /** Text to match against document names. */
  query: string;
  /** Collections to search. */
  collectionIds: string[];
  /** Maximum hits to return. */
  limit?: number;
}

/** Request body for `client.skills.updateCollection()`. All fields are optional. */
export interface UpdateCollectionBody {
  /** Name shown in the UI. */
  displayName?: string;
  /** Free-text description. */
  description?: string;
  /** Number of chunks to retrieve per query. */
  k?: number;
  /** Reranking model name — the same shape `createCollection` accepts. */
  reranker?: string;
  /** Return fewer, higher-confidence chunks. */
  preciseResponses?: boolean;
  /** Attach document metadata to retrieved chunks. */
  includeMetadata?: boolean;
}
