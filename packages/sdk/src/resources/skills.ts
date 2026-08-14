import { appendFilePart } from "../multipart";
import type {
  AttachCollectionDocumentsBody,
  AttachCollectionDocumentsResponse
} from "../types/documents";
import type {
  CollectionDetail,
  CollectionQueryResponse,
  CollectionSearchResponse,
  CollectionStatistics,
  CreateCollectionBody,
  CreateDocumentTemplateBody,
  CreateExternalToolBody,
  CreateTaskBody,
  DeleteCollectionResponse,
  DeleteExternalToolResponse,
  DeleteTaskResponse,
  DocumentTemplateDetail,
  ExecuteTaskBody,
  ExecuteTaskResponse,
  ExternalToolAuth,
  ExternalToolDetail,
  GenerateDocumentTemplateBody,
  GenerateDocumentTemplateResponse,
  InitiateClientCredentialsResponse,
  ListCollectionDocumentsResponse,
  ListCollectionsResponse,
  ListDocumentTemplatesResponse,
  ListExternalToolsResponse,
  ListSkillsCommonParams,
  ListTasksResponse,
  ListWorkflowsResponse,
  QueryCollectionBody,
  RemoveCollectionDocumentResponse,
  SearchCollectionBody,
  SearchMultipleCollectionsBody,
  TaskDetail,
  TestExternalToolBody,
  TestExternalToolResponse,
  UpdateCollectionBody,
  UpdateExternalToolBody,
  UpdateTaskBody,
  UpdateTaskResult,
  WorkflowSummary
} from "../types/skills";
import { BaseResource } from "./base-resource";

/**
 * Skills discovery resource.
 *
 * Provides read-only access to the four skill types that can be attached
 * to agents: workflows, AI tasks, knowledge collections, and document
 * templates.
 *
 * ```
 * client.skills.listWorkflows()          — List org's workflows
 * client.skills.getWorkflow(id)          — Get workflow detail
 * client.skills.listTasks()              — List org's AI tasks
 * client.skills.getTask(id)              — Get task detail with schemas
 * client.skills.listCollections()        — List org's knowledge collections
 * client.skills.getCollection(id)        — Get collection detail
 * client.skills.listDocumentTemplates()  — List org's document templates
 * client.skills.getDocumentTemplate(id)  — Get template detail with inputFormat
 * ```
 *
 * Accessed via `client.skills`.
 */
export class SkillsResource extends BaseResource {
  /**
   * List the organization's workflows.
   *
   * @param params - Optional search, limit, and offset.
   * @returns Matching workflows with `agentInputSchema` and total count.
   *
   * @example
   * ```ts
   * const { items, total } = await client.skills.listWorkflows({ search: "onboarding" });
   * for (const wf of items) {
   *   console.log(`${wf.name} (${wf.status}) - trigger: ${wf.triggerType}`);
   * }
   * ```
   */
  async listWorkflows(params?: ListSkillsCommonParams): Promise<ListWorkflowsResponse> {
    return this.http.request<ListWorkflowsResponse>("GET", "/skills/workflows", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get a single workflow by ID.
   *
   * @param workflowId - Workflow UUID.
   * @returns Full workflow detail including `agentInputSchema`.
   *
   * @example
   * ```ts
   * const wf = await client.skills.getWorkflow("workflow-uuid");
   * console.log(wf.agentInputSchema); // JSON Schema the agent fills
   * ```
   */
  async getWorkflow(workflowId: string): Promise<WorkflowSummary> {
    return this.http.request<WorkflowSummary>("GET", `/skills/workflows/${workflowId}`);
  }

  /**
   * List the organization's AI tasks.
   *
   * @param params - Optional search, limit, and offset.
   * @returns Matching tasks (summary view) and total count.
   *
   * @example
   * ```ts
   * const { items, total } = await client.skills.listTasks({ limit: 50 });
   * for (const task of items) {
   *   console.log(`${task.name} (${task.category}) - ${task.inputFormat} → ${task.outputFormat}`);
   * }
   * ```
   */
  async listTasks(params?: ListSkillsCommonParams): Promise<ListTasksResponse> {
    return this.http.request<ListTasksResponse>("GET", "/skills/tasks", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get a single AI task by ID with full detail.
   *
   * Includes `jsonInputSchema` and `jsonOutputSchema` when the task uses
   * structured JSON input/output.
   *
   * @param taskId - AI Task UUID.
   * @returns Full task detail.
   *
   * @example
   * ```ts
   * const task = await client.skills.getTask("task-uuid");
   * if (task.jsonInputSchema) {
   *   console.log("Input schema:", task.jsonInputSchema);
   * }
   * ```
   */
  async getTask(taskId: string): Promise<TaskDetail> {
    return this.http.request<TaskDetail>("GET", `/skills/tasks/${taskId}`);
  }

  /**
   * List the organization's knowledge collections.
   *
   * @param params - Optional search, limit, and offset.
   * @returns Matching collections (summary view) and total count.
   *
   * @example
   * ```ts
   * const { items } = await client.skills.listCollections();
   * for (const col of items) {
   *   console.log(`${col.name}: ${col.documentCount} documents`);
   * }
   * ```
   */
  async listCollections(params?: ListSkillsCommonParams): Promise<ListCollectionsResponse> {
    return this.http.request<ListCollectionsResponse>("GET", "/skills/collections", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get a single knowledge collection by ID with retrieval settings.
   *
   * @param collectionId - Collection UUID.
   * @returns Full collection detail with `k`, `reranker`, etc.
   *
   * @example
   * ```ts
   * const col = await client.skills.getCollection("collection-uuid");
   * console.log(`k=${col.k}, reranker=${col.reranker}`);
   * ```
   */
  async getCollection(collectionId: string): Promise<CollectionDetail> {
    return this.http.request<CollectionDetail>("GET", `/skills/collections/${collectionId}`);
  }

  /**
   * List the organization's document templates.
   *
   * @param params - Optional search, limit, and offset.
   * @returns Matching templates (summary view) and total count.
   *
   * @example
   * ```ts
   * const { items } = await client.skills.listDocumentTemplates({ search: "invoice" });
   * for (const tpl of items) {
   *   console.log(`${tpl.name} (${tpl.type}) - ${tpl.status}`);
   * }
   * ```
   */
  async listDocumentTemplates(
    params?: ListSkillsCommonParams
  ): Promise<ListDocumentTemplatesResponse> {
    return this.http.request<ListDocumentTemplatesResponse>("GET", "/skills/document-templates", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get a single document template by ID with full detail.
   *
   * Includes `inputFormat` (JSON schema of required inputs) and
   * `slidesInputFormat` (per-slide schemas for presentations).
   *
   * @param templateId - Document template UUID.
   * @returns Full template detail.
   *
   * @example
   * ```ts
   * const tpl = await client.skills.getDocumentTemplate("template-uuid");
   * console.log("Input format:", tpl.inputFormat);
   * ```
   */
  async getDocumentTemplate(templateId: string): Promise<DocumentTemplateDetail> {
    return this.http.request<DocumentTemplateDetail>(
      "GET",
      `/skills/document-templates/${templateId}`
    );
  }

  // =========================================================================
  // CREATE OPERATIONS
  // =========================================================================

  /**
   * Create a new document template (metadata only).
   *
   * Upload a file separately with `uploadDocumentTemplateFile`.
   *
   * @param body - Template name, optional description, and type.
   * @returns Created template detail.
   *
   * @example
   * ```ts
   * const tpl = await client.skills.createDocumentTemplate({
   *   name: "Invoice",
   *   type: "WORD_FORMAT"
   * });
   * ```
   */
  async createDocumentTemplate(body: CreateDocumentTemplateBody): Promise<DocumentTemplateDetail> {
    return this.http.request<DocumentTemplateDetail>("POST", "/skills/document-templates", {
      body
    });
  }

  /**
   * Upload a file and link it to an existing document template.
   *
   * @param templateId - Document template UUID.
   * @param file - File as a `Blob`, `File`, or `Buffer`.
   * @param fileName - File name (required when passing a `Blob` or `Buffer`).
   * @returns Updated template detail with `fileUrl` populated.
   *
   * @example
   * ```ts
   * import fs from "fs";
   *
   * const buffer = fs.readFileSync("template.docx");
   * const tpl = await client.skills.uploadDocumentTemplateFile(
   *   "template-uuid",
   *   new Blob([buffer]),
   *   "template.docx"
   * );
   * console.log(tpl.fileUrl);
   * ```
   */
  async uploadDocumentTemplateFile(
    templateId: string,
    file: Blob,
    fileName?: string
  ): Promise<DocumentTemplateDetail> {
    const formData = new FormData();
    appendFilePart(formData, "file", file, fileName);
    return this.http.request<DocumentTemplateDetail>(
      "POST",
      `/skills/document-templates/${templateId}/upload-file`,
      { body: formData }
    );
  }

  /**
   * Create a new GENERATION AI task.
   *
   * The category is hardcoded to "GENERATION". The `modelName` is validated
   * against the available AI models — on invalid model, returns 400 with
   * the list of valid model names.
   *
   * @param body - Task definition.
   * @returns Created task detail.
   *
   * @example
   * ```ts
   * const task = await client.skills.createTask({
   *   name: "Summarize Email",
   *   modelName: "gpt-4o",
   *   modelProvider: "OPEN_AI",
   *   generation: {
   *     expectedInput: "Raw email text",
   *     expectedOutput: "A concise 2-sentence summary"
   *   }
   * });
   * ```
   */
  async createTask(body: CreateTaskBody): Promise<TaskDetail> {
    return this.http.request<TaskDetail>("POST", "/skills/tasks", { body });
  }

  /**
   * Partially update an existing AI task (name, prompt, model, generation config, etc.).
   *
   * @param taskId - AI Task UUID.
   * @param body - Fields to update.
   * @returns Updated task detail, plus the version snapshot this edit created.
   */
  async updateTask(taskId: string, body: UpdateTaskBody): Promise<UpdateTaskResult> {
    return this.http.request<UpdateTaskResult>("PATCH", `/skills/tasks/${taskId}`, { body });
  }

  /**
   * Permanently delete an AI task.
   *
   * Refuses with 409 if the task is still attached to any agent skill or
   * workflow (draft or published) — `err.details` carries the dependent
   * agents/workflows so they can be detached first.
   *
   * @param taskId - AI Task UUID.
   * @returns `{ id, deleted: true }` on success.
   *
   * @example
   * ```ts
   * try {
   *   await client.skills.deleteTask("task-uuid");
   * } catch (err) {
   *   // 409 if attached; inspect err.details.agents / err.details.workflows
   * }
   * ```
   */
  async deleteTask(taskId: string): Promise<DeleteTaskResponse> {
    return this.http.request<DeleteTaskResponse>("DELETE", `/skills/tasks/${taskId}`);
  }

  /**
   * Create a new knowledge collection.
   *
   * @param body - Collection name and optional settings.
   * @returns Created collection detail.
   *
   * @example
   * ```ts
   * const col = await client.skills.createCollection({
   *   name: "product-docs",
   *   displayName: "Product Documentation",
   *   k: 15
   * });
   * ```
   */
  async createCollection(body: CreateCollectionBody): Promise<CollectionDetail> {
    return this.http.request<CollectionDetail>("POST", "/skills/collections", { body });
  }

  // =========================================================================
  // EXTERNAL TOOLS (CUSTOM_MANIFEST)
  // =========================================================================

  /**
   * List the organization's external tools (CUSTOM_MANIFEST).
   *
   * @param params - Optional search, limit, and offset.
   * @returns Matching external tools and total count.
   *
   * @example
   * ```ts
   * const { items, total } = await client.skills.listExternalTools({ search: "weather" });
   * for (const tool of items) {
   *   console.log(`${tool.name} (${tool.actionsCount} actions) - auth: ${tool.authType}`);
   * }
   * ```
   */
  async listExternalTools(params?: ListSkillsCommonParams): Promise<ListExternalToolsResponse> {
    return this.http.request<ListExternalToolsResponse>("GET", "/skills/external-tools", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get a single external tool by ID.
   *
   * @param externalToolId - External tool UUID.
   * @returns Full external tool detail.
   *
   * @example
   * ```ts
   * const tool = await client.skills.getExternalTool("tool-uuid");
   * console.log(`${tool.name}: ${tool.actionsCount} actions, auth: ${tool.authType}`);
   * ```
   */
  async getExternalTool(externalToolId: string): Promise<ExternalToolDetail> {
    return this.http.request<ExternalToolDetail>("GET", `/skills/external-tools/${externalToolId}`);
  }

  /**
   * Create a new external tool from an OpenAPI spec.
   *
   * Parses the provided OpenAPI spec (JSON or YAML), extracts actions,
   * and creates the tool with the specified auth configuration.
   *
   * @param body - Tool name, OpenAPI spec, endpoint URL, and auth config.
   * @returns Created external tool detail with `actionsCount`.
   *
   * @example
   * ```ts
   * const tool = await client.skills.createExternalTool({
   *   name: "Weather API",
   *   openApiSpec: '{"openapi":"3.0.0",...}',
   *   endpointUrl: "https://api.weather.com",
   *   auth: { type: "service_http", apiKey: "sk-...", authorization_type: "bearer" }
   * });
   * console.log(`Created: ${tool.name} with ${tool.actionsCount} actions`);
   * ```
   */
  async createExternalTool(body: CreateExternalToolBody): Promise<ExternalToolDetail> {
    return this.http.request<ExternalToolDetail>("POST", "/skills/external-tools", { body });
  }

  /**
   * Upload an icon/logo image for an external tool.
   *
   * @param externalToolId - External tool UUID.
   * @param file - Image file as a `Blob`, `File`, or `Buffer`.
   * @param fileName - File name (required when passing a `Blob` or `Buffer`).
   * @returns Updated external tool detail with `imageUrl` populated.
   *
   * @example
   * ```ts
   * import fs from "fs";
   *
   * const buffer = fs.readFileSync("logo.png");
   * const tool = await client.skills.uploadExternalToolIcon(
   *   "tool-uuid",
   *   new Blob([buffer]),
   *   "logo.png"
   * );
   * console.log(tool.imageUrl);
   * ```
   */
  async uploadExternalToolIcon(
    externalToolId: string,
    file: Blob,
    fileName?: string
  ): Promise<ExternalToolDetail> {
    const formData = new FormData();
    appendFilePart(formData, "file", file, fileName);
    return this.http.request<ExternalToolDetail>(
      "POST",
      `/skills/external-tools/${externalToolId}/upload-icon`,
      { body: formData }
    );
  }

  /**
   * Test an external tool action by operationId with input parameters.
   *
   * Executes a specific action on an external tool and returns the result.
   * Optionally uses stored credentials for authentication.
   *
   * @param externalToolId - External tool UUID.
   * @param body - operationId, input params, and optional toolCredentialId.
   * @returns Execution result with status, output, and timing.
   *
   * @example
   * ```ts
   * const result = await client.skills.testExternalTool("tool-uuid", {
   *   operationId: "getWeather",
   *   input: { city: "London" }
   * });
   * console.log(`${result.status} in ${result.executionTimeMs}ms:`, result.output);
   * ```
   */
  async testExternalTool(
    externalToolId: string,
    body: TestExternalToolBody
  ): Promise<TestExternalToolResponse> {
    return this.http.request<TestExternalToolResponse>(
      "POST",
      `/skills/external-tools/${externalToolId}/test`,
      { body }
    );
  }

  /**
   * Initiate OAuth client_credentials flow for an external tool.
   * Directly fetches an access token from the token endpoint — no browser redirect.
   *
   * @param externalToolId - External tool UUID.
   * @param name - Optional credential name.
   * @returns Created credential ID.
   */
  async initiateClientCredentials(
    externalToolId: string,
    name?: string
  ): Promise<InitiateClientCredentialsResponse> {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    return this.http.request<InitiateClientCredentialsResponse>(
      "POST",
      `/tools/${externalToolId}/initiate-client-credentials${query}`
    );
  }

  /**
   * Update the auth configuration on an existing external tool.
   *
   * Use `updateExternalTool` for general field updates; this method exists
   * for the auth-only path that was shipped first.
   *
   * @param externalToolId - External tool UUID.
   * @param auth - New auth configuration.
   * @returns Updated external tool detail.
   */
  async updateExternalToolAuth(
    externalToolId: string,
    auth: ExternalToolAuth
  ): Promise<ExternalToolDetail> {
    return this.http.request<ExternalToolDetail>(
      "PATCH",
      `/skills/external-tools/${externalToolId}`,
      { body: { auth } }
    );
  }

  /**
   * Partial update of an external tool (name, description, documentation,
   * openApiSpec, endpointUrl, or auth).
   *
   * Refreshing `openApiSpec` re-parses the spec and rebuilds the action list
   * while preserving the toolId, auth, credentials, icon, and downstream wiring.
   * If the refresh would drop or rename an action key still bound by a workflow
   * node or agent tool config, it fails with 409 (code TOOL_SPEC_BREAKING_CHANGE;
   * inspect `err.details.removedActions` / `err.details.bindings`). Pass
   * `{ force: true }` to override.
   *
   * @param externalToolId - External tool UUID.
   * @param body - Fields to update; omit a field to leave it unchanged.
   * @param opts.force - When true, skip the breaking-change guard (default false).
   * @returns Updated external tool detail.
   *
   * @example
   * ```ts
   * await client.skills.updateExternalTool("tool-uuid", { name: "Renamed Tool" });
   * await client.skills.updateExternalTool("tool-uuid", { openApiSpec }, { force: true });
   * ```
   */
  async updateExternalTool(
    externalToolId: string,
    body: UpdateExternalToolBody,
    opts?: { force?: boolean }
  ): Promise<ExternalToolDetail> {
    const query = opts?.force ? "?force=true" : "";
    return this.http.request<ExternalToolDetail>(
      "PATCH",
      `/skills/external-tools/${externalToolId}${query}`,
      { body }
    );
  }

  /**
   * Delete an external tool.
   *
   * Refuses with 409 (and a sample of attached agent tool configs) if anything
   * depends on this tool. Pass `force: true` to cascade — the referencing
   * AgentToolConfig rows are deleted alongside the tool. ToolCredentials are
   * always cleaned up regardless of `force`.
   *
   * @param externalToolId - External tool UUID.
   * @param opts.force - When true, cascade-delete dependents (default false).
   * @returns `{ deleted: true }` on success.
   *
   * @example
   * ```ts
   * try {
   *   await client.skills.deleteExternalTool("tool-uuid");
   * } catch (err) {
   *   // 409 if attached; inspect err.details.sample / err.details.total
   *   await client.skills.deleteExternalTool("tool-uuid", { force: true });
   * }
   * ```
   */
  async deleteExternalTool(
    externalToolId: string,
    opts?: { force?: boolean }
  ): Promise<DeleteExternalToolResponse> {
    const query = opts?.force ? "?force=true" : "";
    return this.http.request<DeleteExternalToolResponse>(
      "DELETE",
      `/skills/external-tools/${externalToolId}${query}`
    );
  }

  // =========================================================================
  // COLLECTION DOCUMENT LINKING
  // =========================================================================

  /**
   * Attach existing documents to a knowledge collection.
   *
   * @param collectionId - Collection UUID.
   * @param body - Array of document IDs to link.
   * @returns Status message.
   *
   * @example
   * ```ts
   * await client.skills.attachDocumentsToCollection("collection-uuid", {
   *   documentIds: ["doc-1", "doc-2"]
   * });
   * ```
   */
  async attachDocumentsToCollection(
    collectionId: string,
    body: AttachCollectionDocumentsBody
  ): Promise<AttachCollectionDocumentsResponse> {
    return this.http.request<AttachCollectionDocumentsResponse>(
      "POST",
      `/skills/collections/${collectionId}/documents`,
      { body }
    );
  }

  // =========================================================================
  // EXECUTION OPERATIONS
  // =========================================================================

  /**
   * Generate a document from a template with variable values.
   *
   * @param templateId - Document template UUID.
   * @param body - Variables to fill in the template.
   * @returns A SIGNED URL to the generated document, valid for about an hour.
   *   Fetch it now; storing it produces a link that stops working. There is no
   *   re-sign call — generate again to get a fresh one.
   *
   * @example
   * ```ts
   * const { url } = await client.skills.generateDocumentTemplate("template-uuid", {
   *   variables: { name: "John", date: "2025-01-01" }
   * });
   * console.log("Generated document:", url);
   * ```
   */
  async generateDocumentTemplate(
    templateId: string,
    body: GenerateDocumentTemplateBody
  ): Promise<GenerateDocumentTemplateResponse> {
    return this.http.request<GenerateDocumentTemplateResponse>(
      "POST",
      `/skills/document-templates/${templateId}/generate`,
      { body }
    );
  }

  /**
   * Execute an AI task with input and get the output.
   *
   * @param taskId - AI Task UUID.
   * @param body - Input to the task.
   * @returns Task output and output type.
   *
   * @example
   * ```ts
   * const { output, outputType } = await client.skills.executeTask("task-uuid", {
   *   input: "Summarize this document"
   * });
   * console.log(`Output (${outputType}):`, output);
   * ```
   */
  async executeTask(taskId: string, body: ExecuteTaskBody): Promise<ExecuteTaskResponse> {
    return this.http.request<ExecuteTaskResponse>("POST", `/skills/tasks/${taskId}/execute`, {
      body
    });
  }

  // ===== COLLECTION MANAGEMENT (Enhanced) =====

  /**
   * List the documents in a collection.
   *
   * The response is NOT a `PageResponse`: this route nests its page envelope
   * inside `data`, so the items are at `result.data` and the pagination at
   * `result.meta`. Reading it through `requestPage` — which expects the meta on
   * the envelope — produced a `meta.total` of `undefined`, so this method uses a
   * plain request and reports the shape the server actually sends.
   *
   * @param collectionId - Collection UUID.
   * @param params - Optional pagination.
   * @returns The page of documents and its nested pagination metadata.
   */
  async listCollectionDocuments(
    collectionId: string,
    params?: { page?: number; limit?: number }
  ): Promise<ListCollectionDocumentsResponse> {
    return this.http.request<ListCollectionDocumentsResponse>(
      "GET",
      `/skills/collections/${collectionId}/documents`,
      { query: params as Record<string, string | number | undefined> }
    );
  }

  /**
   * Remove a document from a collection. The document itself is not deleted.
   *
   * @param collectionId - Collection UUID.
   * @param documentId - Document UUID.
   * @returns Confirmation. Idempotent — removing an unlinked document still
   *   reports `removed: true`.
   */
  async removeCollectionDocument(
    collectionId: string,
    documentId: string
  ): Promise<RemoveCollectionDocumentResponse> {
    return this.http.request<RemoveCollectionDocumentResponse>(
      "DELETE",
      `/skills/collections/${collectionId}/documents/${documentId}`
    );
  }

  /**
   * Document counts, size and embedding progress for a collection.
   *
   * @param collectionId - Collection UUID.
   * @returns The collection's statistics.
   */
  async getCollectionStatistics(collectionId: string): Promise<CollectionStatistics> {
    return this.http.request<CollectionStatistics>(
      "GET",
      `/skills/collections/${collectionId}/statistics`
    );
  }

  /**
   * Search a collection by document NAME.
   *
   * Every hit scores 1 — this endpoint matches names and does not rank. Use
   * {@link SkillsResource.queryCollection} to search document CONTENT.
   *
   * @param collectionId - Collection UUID.
   * @param body - The text to match, and how many hits to return.
   * @returns The matched documents.
   */
  async searchCollection(
    collectionId: string,
    body: SearchCollectionBody
  ): Promise<CollectionSearchResponse> {
    return this.http.request<CollectionSearchResponse>(
      "POST",
      `/skills/collections/${collectionId}/search`,
      { body }
    );
  }

  /**
   * Semantic content retrieval within a collection (ZeroEntropy) — matches
   * document content, unlike searchCollection which matches document names.
   */
  async queryCollection(
    collectionId: string,
    body: QueryCollectionBody
  ): Promise<CollectionQueryResponse> {
    return this.http.request<CollectionQueryResponse>(
      "POST",
      `/skills/collections/${collectionId}/query`,
      { body }
    );
  }

  /**
   * Search several collections at once, by document NAME.
   *
   * `metadata` is always `null` on these hits — this route has no
   * `includeMetadata` option to turn it on.
   *
   * @param body - The text to match and the collections to search.
   * @returns The matched documents.
   */
  async searchMultipleCollections(
    body: SearchMultipleCollectionsBody
  ): Promise<CollectionSearchResponse> {
    return this.http.request<CollectionSearchResponse>("POST", "/skills/collections/search", {
      body
    });
  }

  /**
   * Update a collection's display settings and retrieval configuration.
   *
   * @param collectionId - Collection UUID.
   * @param body - Fields to update.
   * @returns The updated collection. `documentCount` reads 0 on this response
   *   regardless of the real count — the update query does not recount.
   */
  async updateCollection(
    collectionId: string,
    body: UpdateCollectionBody
  ): Promise<CollectionDetail> {
    return this.http.request<CollectionDetail>("PATCH", `/skills/collections/${collectionId}`, {
      body
    });
  }

  /**
   * Delete a collection. Its documents are unlinked, not deleted.
   *
   * @param collectionId - Collection UUID.
   * @returns Confirmation carrying the deleted collection's id.
   */
  async deleteCollection(collectionId: string): Promise<DeleteCollectionResponse> {
    return this.http.request<DeleteCollectionResponse>(
      "DELETE",
      `/skills/collections/${collectionId}`
    );
  }
}
