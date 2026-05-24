import type { DeleteResponse, PageResponse } from "../types/common";
import type {
  AvailableVariable,
  BatchRequestBody,
  BatchResult,
  Branch,
  CreateBranchBody,
  CreateEdgeBody,
  CreateNodeBody,
  CreateWorkflowBody,
  ExecutionStatus,
  IconResult,
  ListWorkflowsParams,
  NodeExecutionResult,
  NodeTypeSchema,
  NodeTypeSummary,
  OutputFormat,
  PlatformListenerEvent,
  PublishResult,
  ReloadPropsBody,
  ReloadPropsResponse,
  ReplaceTriggerBody,
  TestNodeBody,
  TestResult,
  TestWorkflowBody,
  UnpublishResult,
  UpdateBranchBody,
  UpdateNodeBody,
  UpdateWorkflowBody,
  ValidationReport,
  WfSummary,
  WorkflowDetail,
  WorkflowEdge,
  WorkflowNode,
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
    const { data, meta } = await this.http.requestWithMeta<WfSummary[]>("GET", "/workflows", {
      query: params as Record<string, string | number | undefined>
    });
    return { data, meta: meta! };
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
   * Permanently delete a workflow and all its nodes, edges, and executions.
   *
   * @param workflowId - Workflow UUID.
   * @returns Confirmation with the deleted workflow's ID.
   */
  async delete(workflowId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/workflows/${workflowId}`);
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
   * @returns URL of the uploaded icon.
   */
  async uploadIcon(workflowId: string, file: Blob | File): Promise<IconResult> {
    const formData = new FormData();
    formData.append("file", file);
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
   * @returns The created node.
   */
  async createNode(workflowId: string, body: CreateNodeBody): Promise<WorkflowNode> {
    return this.http.request<WorkflowNode>("POST", `/workflows/${workflowId}/nodes`, { body });
  }

  /**
   * Get a specific node within a workflow.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @returns The node detail.
   */
  async getNode(workflowId: string, nodeId: string): Promise<WorkflowNode> {
    return this.http.request<WorkflowNode>("GET", `/workflows/${workflowId}/nodes/${nodeId}`);
  }

  /**
   * Update a node's data. Only the `data` field is replaced.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @param body - New data for the node.
   * @returns The updated node.
   */
  async updateNode(
    workflowId: string,
    nodeId: string,
    body: UpdateNodeBody
  ): Promise<WorkflowNode> {
    return this.http.request<WorkflowNode>("PATCH", `/workflows/${workflowId}/nodes/${nodeId}`, {
      body
    });
  }

  /**
   * Delete a node from a workflow. Connected edges are also removed.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @returns Confirmation with the deleted node's ID.
   */
  async deleteNode(workflowId: string, nodeId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/workflows/${workflowId}/nodes/${nodeId}`);
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
   * @param workflowId - Workflow UUID.
   * @param body - New trigger type.
   * @returns The updated workflow detail.
   */
  async replaceTrigger(workflowId: string, body: ReplaceTriggerBody): Promise<WorkflowDetail> {
    return this.http.request<WorkflowDetail>("PUT", `/workflows/${workflowId}/trigger`, { body });
  }

  // =========================================================================
  // BRANCHES
  // =========================================================================

  /**
   * List branches on a conditional or router node.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @returns Array of branches.
   */
  async listBranches(workflowId: string, nodeId: string): Promise<Branch[]> {
    return this.http.request<Branch[]>("GET", `/workflows/${workflowId}/nodes/${nodeId}/branches`);
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
   * @returns The updated branch.
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
   * @returns Confirmation with the deleted branch's ID.
   */
  async deleteBranch(
    workflowId: string,
    nodeId: string,
    branchId: string
  ): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>(
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
   * @returns The created edge.
   */
  async createEdge(workflowId: string, body: CreateEdgeBody): Promise<WorkflowEdge> {
    return this.http.request<WorkflowEdge>("POST", `/workflows/${workflowId}/edges`, { body });
  }

  /**
   * Delete an edge from a workflow.
   *
   * @param workflowId - Workflow UUID.
   * @param edgeId - Edge UUID.
   * @returns Confirmation with the deleted edge's ID.
   */
  async deleteEdge(workflowId: string, edgeId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/workflows/${workflowId}/edges/${edgeId}`);
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
   * @param workflowId - Workflow UUID.
   * @returns The updated workflow detail with new node positions.
   */
  async layout(workflowId: string): Promise<WorkflowDetail> {
    return this.http.request<WorkflowDetail>("POST", `/workflows/${workflowId}/layout`);
  }

  /**
   * Get variables available to a specific node from upstream nodes.
   *
   * @param workflowId - Workflow UUID.
   * @param nodeId - Node UUID.
   * @returns Array of available variables grouped by source node.
   */
  async getAvailableVariables(workflowId: string, nodeId: string): Promise<AvailableVariable[]> {
    return this.http.request<AvailableVariable[]>(
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
   * @param body - Optional input data for the node.
   * @returns Execution ID for polling status.
   */
  async testNode(workflowId: string, nodeId: string, body?: TestNodeBody): Promise<TestResult> {
    return this.http.request<TestResult>("POST", `/workflows/${workflowId}/nodes/${nodeId}/test`, {
      body
    });
  }

  /**
   * Test-execute an entire workflow with optional trigger data.
   *
   * @param workflowId - Workflow UUID.
   * @param body - Optional trigger data to start the workflow.
   * @returns Execution ID for polling status.
   */
  async testWorkflow(workflowId: string, body?: TestWorkflowBody): Promise<TestResult> {
    return this.http.request<TestResult>("POST", `/workflows/${workflowId}/test`, { body });
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
   * @returns Updated execution status.
   */
  async stopExecution(workflowId: string, executionId: string): Promise<ExecutionStatus> {
    return this.http.request<ExecutionStatus>(
      "POST",
      `/workflows/${workflowId}/executions/${executionId}/stop`
    );
  }
}
