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

/** Full AI task detail (extends summary with schemas). */
export interface TaskDetail extends TaskSummary {
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
  modelProvider: "OPEN_AI" | "ANTHROPIC" | "GOOGLE_AI";
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
  modelProvider?: "OPEN_AI" | "ANTHROPIC" | "GOOGLE_AI";
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
