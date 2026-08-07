import { appendFilePart } from "../multipart";
import type { PageResponse } from "../types/common";
import type {
  AvailableVariables,
  BatchRequestBody,
  BatchResult,
  Branch,
  BranchList,
  CreateBranchBody,
  CreateEdgeBody,
  CreateNodeBody,
  CreateWorkflowBody,
  ExecutionStatus,
  IconResult,
  ListWorkflowsParams,
  NodeExecutionResult,
  NodeResponse,
  NodeTypeSchema,
  NodeTypeSummary,
  OutputFormat,
  PlatformListenerEvent,
  PublishResult,
  ReloadPropsBody,
  ReloadPropsResponse,
  ReplaceTriggerBody,
  ReplaceTriggerResult,
  StopExecutionResult,
  TestNodeBody,
  TestNodeResult,
  TestWorkflowBody,
  TestWorkflowResult,
  UnpublishResult,
  UpdateBranchBody,
  UpdateNodeBody,
  UpdateWorkflowBody,
  ValidationReport,
  WebhookTestPayload,
  WfSummary,
  WorkflowArchiveResult,
  WorkflowDetail,
  WorkflowEdge,
  WorkflowOverview
} from "../types/workflows";
import { BaseResource } from "./base-resource";

/**
 * Workflow management resource. Accessed via `client.workflows`.
 *
 * Provides full CRUD for workflows plus sub-operations for nodes, edges,
 * branches, overview/validation, builder node-types, and test executions.
 *
 * ```
 * client.workflows.list()                          — List workflows
 * client.workflows.create({ name: "My Flow" })     — Create workflow
 * client.workflows.createNode(wfId, { type })       — Add a node
 * client.workflows.testWorkflow(wfId, { ... })      — Run a test
 * client.workflows.publish(wfId)                    — Publish workflow
 * ```
 */
export class WorkflowsResource extends BaseResource {
  // =========================================================================
  // CRUD
  // =========================================================================

  /**
   * List workflows with optional filtering and pagination.
   *
   * @param params - Optional status filter, search, and pagination.
   * @returns Paginated list of workflow summaries.
   */
  async list(params?: ListWorkflowsParams): Promise<PageResponse<WfSummary>> {
    return this.http.requestPage<WfSummary>("GET", "/workflows", { query: params });
  }

  /**
   * Create a new workflow.
   *
   * @param body - Workflow name and optional description.
   * @returns The created workflow detail.
   */
  async create(body: CreateWorkflowBody): Promise<WorkflowDetail> {
    return this.http.request<WorkflowDetail>("POST", "/workflows", { body });
  }

  /**
   * Get detailed information about a specific workflow, including nodes and edges.
   *
   * @param workflowId - Workflow UUID.
   * @returns Full workflow detail.
   */
  async get(workflowId: string): Promise<WorkflowDetail> {
    return this.http.request<WorkflowDetail>("GET", `/workflows/${workflowId}`);
  }

  /**
   * Update an existing workflow's properties. Only provided fields are updated.
   *
   * @param workflowId - Workflow UUID.
   * @param body - Fields to update.
   * @returns The updated workflow detail.
   */
  async update(workflowId: string, body: UpdateWorkflowBody): Promise<WorkflowDetail> {
    return this.http.request<WorkflowDetail>("PATCH", `/workflows/${workflowId}`, { body });
  }

  /**
   * Archive a workflow. This is a SOFT delete: the workflow's status becomes
   * `"ARCHIVED"` and its triggers are removed. Nodes, edges and executions are
   * kept.
   *
   * @param workflowId - Workflow UUID.
   * @returns The archived workflow's id, status and archive timestamp.
   */
  async delete(workflowId: string): Promise<WorkflowArchiveResult> {
    return this.http.request<WorkflowArchiveResult>("DELETE", `/workflows/${workflowId}`);
  }

  /**
   * Create a copy of an existing workflow.
   *
   * @param workflowId - Workflow UUID to duplicate.
   * @returns The newly created workflow detail.
   */
  async duplicate(workflowId: string): Promise<WorkflowDetail> {
    return this.http.request<WorkflowDetail>("POST", `/workflows/${workflowId}/duplicate`);
  }

  /**
   * Publish a workflow, making it available for execution.
   *
   * @param workflowId - Workflow UUID.
   * @returns Publish confirmation with updated status.
   */
  async publish(workflowId: string): Promise<PublishResult> {
    return this.http.request<PublishResult>("POST", `/workflows/${workflowId}/publish`);
  }

  /**
   * Unpublish a workflow, reverting it to draft status.
   *
   * @param workflowId - Workflow UUID.
   * @returns Unpublish confirmation with updated status.
   */
  async unpublish(workflowId: string): Promise<UnpublishResult> {
    return this.http.request<UnpublishResult>("POST", `/workflows/${workflowId}/unpublish`);
  }

  /**
   * Upload an icon image for a workflow.
   *
   * @param workflowId - Workflow UUID.
   * @param file - Image file as a Blob or File.
   * @param fileName - File name to send. A bare `Blob` carries none, and the
   *   multipart part is then named `blob`; a `File` supplies its own.
   * @returns URL of the uploaded icon.
   */
  async uploadIcon(workflowId: string, file: Blob | File, fileName?: string): Promise<IconResult> {
    const formData = new FormData();
    appendFilePart(formData, "file", file, fileName);
    return this.http.request<IconResult>("POST", `/workflows/${workflowId}/icon`, {
      body: formData
    });
  }

  // =========================================================================
  // BATCH
  // =========================================================================

  /**
   * Batch-create nodes, edges, and branches in a single request.
   *
   * Node and branch `ref` fields (prefixed with `@`) are resolved to real UUIDs
   * server-side. The response maps each ref to the created UUID.
   *
   * @param workflowId - Workflow UUID.
   * @param body - Nodes, edges, and edge deletions to apply.
   * @returns Mapping of refs to created UUIDs.
   */
  async batch(workflowId: string, body: BatchRequestBody): Promise<BatchResult> {
    return this.http.request<BatchResult>("POST", `/workflows/${workflowId}/batch`, { body });
  }

  // =========================================================================
  // BUILDER (Node Types)
  // =========================================================================

  /**
   * List all available node types for the workflow builder.
   *
   * @returns Array of node type summaries.
   */
  async listNodeTypes(): Promise<NodeTypeSummary[]> {
    return this.http.request<NodeTypeSummary[]>("GET", "/workflows/node-types");
  }

  /**
   * Get the full schema for a specific node type, including fields and connection rules.
   *
   * @param nodeType - Node type identifier.
   * @returns Node type schema with fields, configuration steps, and defaults.
   */
  async getNodeTypeSchema(nodeType: string): Promise<NodeTypeSchema> {
    return this.http.request<NodeTypeSchema>("GET", `/workflows/node-types/${nodeType}`);
  }

  /**
   * List every platform event a `platformListenerTrigger` node can subscribe to.
   * Each entry carries an `eventType` key plus a `samplePayload` showing what
   * the workflow will receive when the event fires.
   *
   * @returns The list of available platform listener events.
   */
  async listPlatformListenerEvents(): Promise<{ events: PlatformListenerEvent[] }> {
    return this.http.request<{ events: PlatformListenerEvent[] }>(
      "GET",
      "/workflows/platform-listener-events"
    );
  }

  // =========================================================================
  // NODES
  // =========================================================================

  /**
   * Create a new node in a workflow.
   *
   * @param workflowId - Workflow UUID.
   * @param body - Node type, position, data, and optional parent.
   * @returns The created node, with its configuration status.
   */
  async createNode(workflowId: string, body: CreateNodeBody): Promise<NodeResponse> {
    return this.http.request<NodeResponse>("POST", `/workflows/${workflowId}/nodes`, { body });
  }

  /**
   * Get a specific node within a workflow.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @returns The node, with its configuration status.
   */
  async getNode(workflowId: string, nodeId: string): Promise<NodeResponse> {
    return this.http.request<NodeResponse>("GET", `/workflows/${workflowId}/nodes/${nodeId}`);
  }

  /**
   * Update a node. Supply `data` to replace its configuration, `parentId` to
   * move it into or out of a loop / doWhile container, or both. At least one is
   * required.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @param body - New data and/or new loop scope for the node.
   * @returns The updated node, with its configuration status.
   */
  async updateNode(
    workflowId: string,
    nodeId: string,
    body: UpdateNodeBody
  ): Promise<NodeResponse> {
    return this.http.request<NodeResponse>("PATCH", `/workflows/${workflowId}/nodes/${nodeId}`, {
      body
    });
  }

  /**
   * Delete a node from a workflow. Connected edges are also removed.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @returns Nothing — the endpoint replies `204 No Content`.
   */
  async deleteNode(workflowId: string, nodeId: string): Promise<void> {
    await this.http.request<void>("DELETE", `/workflows/${workflowId}/nodes/${nodeId}`);
  }

  /**
   * Reload dynamic properties for a node (e.g. after selecting a tool or action).
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @param body - Currently configured props and optional dynamic props ID.
   * @returns Updated parameters setup and any errors.
   */
  async reloadProps(
    workflowId: string,
    nodeId: string,
    body: ReloadPropsBody
  ): Promise<ReloadPropsResponse> {
    return this.http.request<ReloadPropsResponse>(
      "POST",
      `/workflows/${workflowId}/nodes/${nodeId}/reload-props`,
      { body }
    );
  }

  /**
   * Replace the trigger node of a workflow with a different trigger type.
   *
   * Trigger-specific configuration is NOT accepted here — set it afterwards with
   * `updateNode(workflowId, result.node.id, { data })`.
   *
   * @param workflowId - Workflow UUID.
   * @param body - New trigger type.
   * @returns The new trigger node and the edges rewired onto it.
   */
  async replaceTrigger(
    workflowId: string,
    body: ReplaceTriggerBody
  ): Promise<ReplaceTriggerResult> {
    return this.http.request<ReplaceTriggerResult>("PUT", `/workflows/${workflowId}/trigger`, {
      body
    });
  }

  // =========================================================================
  // BRANCHES
  // =========================================================================

  /**
   * List branches on a conditional or router node.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @returns The node's branches, plus the output handles they expose.
   */
  async listBranches(workflowId: string, nodeId: string): Promise<BranchList> {
    return this.http.request<BranchList>(
      "GET",
      `/workflows/${workflowId}/nodes/${nodeId}/branches`
    );
  }

  /**
   * Create a new branch on a conditional or router node.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @param body - Branch name and optional description.
   * @returns The created branch.
   */
  async createBranch(workflowId: string, nodeId: string, body: CreateBranchBody): Promise<Branch> {
    return this.http.request<Branch>("POST", `/workflows/${workflowId}/nodes/${nodeId}/branches`, {
      body
    });
  }

  /**
   * Update a branch on a node.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @param branchId - Branch UUID.
   * @param body - Fields to update.
   * @returns The stored branch with the patched fields applied.
   */
  async updateBranch(
    workflowId: string,
    nodeId: string,
    branchId: string,
    body: UpdateBranchBody
  ): Promise<Branch> {
    return this.http.request<Branch>(
      "PATCH",
      `/workflows/${workflowId}/nodes/${nodeId}/branches/${branchId}`,
      { body }
    );
  }

  /**
   * Delete a branch from a node.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @param branchId - Branch UUID.
   * @returns Nothing — the endpoint replies `204 No Content`.
   */
  async deleteBranch(workflowId: string, nodeId: string, branchId: string): Promise<void> {
    await this.http.request<void>(
      "DELETE",
      `/workflows/${workflowId}/nodes/${nodeId}/branches/${branchId}`
    );
  }

  // =========================================================================
  // EDGES
  // =========================================================================

  /**
   * Create an edge between two nodes in a workflow.
   *
   * @param workflowId - Workflow UUID.
   * @param body - Source node, target node, optional handle and type.
   * @returns The created edge. `targetHandle` is never set by this route.
   */
  async createEdge(workflowId: string, body: CreateEdgeBody): Promise<WorkflowEdge> {
    return this.http.request<WorkflowEdge>("POST", `/workflows/${workflowId}/edges`, { body });
  }

  /**
   * Delete an edge from a workflow.
   *
   * @param workflowId - Workflow UUID.
   * @param edgeId - Edge UUID.
   * @returns Nothing — the endpoint replies `204 No Content`.
   */
  async deleteEdge(workflowId: string, edgeId: string): Promise<void> {
    await this.http.request<void>("DELETE", `/workflows/${workflowId}/edges/${edgeId}`);
  }

  // =========================================================================
  // OVERVIEW
  // =========================================================================

  /**
   * Get a high-level overview of a workflow with node summaries.
   *
   * @param workflowId - Workflow UUID.
   * @returns Workflow overview with node labels and config statuses.
   */
  async getOverview(workflowId: string): Promise<WorkflowOverview> {
    return this.http.request<WorkflowOverview>("GET", `/workflows/${workflowId}/overview`);
  }

  /**
   * Auto-layout the nodes in a workflow graph.
   *
   * The new coordinates are not returned: the reply is a fresh overview, the
   * same payload {@link getOverview} produces. Layout lives on the canvas and
   * the API does not surface it.
   *
   * @param workflowId - Workflow UUID.
   * @returns The workflow overview, re-read after the layout was applied.
   */
  async layout(workflowId: string): Promise<WorkflowOverview> {
    return this.http.request<WorkflowOverview>("POST", `/workflows/${workflowId}/layout`);
  }

  /**
   * Get variables available to a specific node from upstream nodes.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @returns The available variables, wrapped in a `variables` key.
   */
  async getAvailableVariables(workflowId: string, nodeId: string): Promise<AvailableVariables> {
    return this.http.request<AvailableVariables>(
      "GET",
      `/workflows/${workflowId}/nodes/${nodeId}/available-variables`
    );
  }

  /**
   * Get the output format definition for a specific node.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @returns Output format with source indicator.
   */
  async getOutputFormat(workflowId: string, nodeId: string): Promise<OutputFormat> {
    return this.http.request<OutputFormat>(
      "GET",
      `/workflows/${workflowId}/nodes/${nodeId}/output-format`
    );
  }

  /**
   * Get a webhook trigger node's test + production URLs and the last payload a
   * test event delivered to it.
   *
   * The URLs are available pre-publish. After firing a test event at the
   * returned `testWebhookUrl`, call this again to read back the captured
   * payload (`received: true`).
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Webhook trigger node UUID.
   * @returns Webhook URLs plus the last received test payload (if any).
   */
  async getWebhookTestPayload(workflowId: string, nodeId: string): Promise<WebhookTestPayload> {
    return this.http.request<WebhookTestPayload>(
      "GET",
      `/workflows/${workflowId}/nodes/${nodeId}/test-payload`
    );
  }

  /**
   * Validate a workflow for completeness and correctness.
   *
   * @param workflowId - Workflow UUID.
   * @returns Validation report with node issues and graph issues.
   */
  async validate(workflowId: string): Promise<ValidationReport> {
    return this.http.request<ValidationReport>("GET", `/workflows/${workflowId}/validate`);
  }

  // =========================================================================
  // TESTING
  // =========================================================================

  /**
   * Test-execute a single node with optional input.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * A run that FAILED still reports `status: "COMPLETED"` — the failure is
   * inside `data`. `"PENDING"` means the run went asynchronous; poll
   * {@link getNodeExecutionResult} for the outcome.
   *
   * @param body - Optional input data for the node.
   * @returns The execution id, its status, and the result when one is ready.
   */
  async testNode(workflowId: string, nodeId: string, body?: TestNodeBody): Promise<TestNodeResult> {
    return this.http.request<TestNodeResult>(
      "POST",
      `/workflows/${workflowId}/nodes/${nodeId}/test`,
      { body }
    );
  }

  /**
   * Test-execute an entire workflow with optional trigger data.
   *
   * @param workflowId - Workflow UUID.
   * @param body - Optional trigger data to start the workflow.
   * @returns Execution ID for polling status.
   */
  async testWorkflow(workflowId: string, body?: TestWorkflowBody): Promise<TestWorkflowResult> {
    return this.http.request<TestWorkflowResult>("POST", `/workflows/${workflowId}/test`, { body });
  }

  /**
   * Get the status of a workflow execution.
   *
   * @param workflowId - Workflow UUID.
   * @param executionId - Execution UUID.
   * @returns Execution status with per-node statuses.
   */
  async getExecutionStatus(workflowId: string, executionId: string): Promise<ExecutionStatus> {
    return this.http.request<ExecutionStatus>(
      "GET",
      `/workflows/${workflowId}/executions/${executionId}`
    );
  }

  /**
   * Get the execution result for a specific node within a workflow execution.
   *
   * @param workflowId - Workflow UUID.
   * @param executionId - Execution UUID.
   * @param nodeId - Node UUID.
   * @returns Node execution result with input, output, and logs.
   */
  async getNodeExecutionResult(
    workflowId: string,
    executionId: string,
    nodeId: string
  ): Promise<NodeExecutionResult> {
    return this.http.request<NodeExecutionResult>(
      "GET",
      `/workflows/${workflowId}/executions/${executionId}/nodes/${nodeId}`
    );
  }

  /**
   * Stop a running workflow execution.
   *
   * @param workflowId - Workflow UUID.
   * @param executionId - Execution UUID.
   * @returns How many executions were cancelled, and a human-readable message.
   */
  async stopExecution(workflowId: string, executionId: string): Promise<StopExecutionResult> {
    return this.http.request<StopExecutionResult>(
      "POST",
      `/workflows/${workflowId}/executions/${executionId}/stop`
    );
  }
}
