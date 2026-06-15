// ============================================================================
// Workflow CRUD
// ============================================================================

/** Workflow lifecycle status. */
export type WorkflowStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/**
 * Folder a resource belongs to, surfaced on list responses. `null` when the
 * resource is not assigned to any folder.
 */
export interface FolderRef {
  id: string;
  name: string;
}

/** Summary view of a workflow returned by list endpoints. */
export interface WfSummary {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  triggerType: string | null;
  nodeCount: number;
  /** Folder the workflow belongs to, or `null` if unassigned. */
  folder: FolderRef | null;
  createdAt: string;
  updatedAt: string;
}

/** A single node in a workflow graph. */
export interface WorkflowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  parentId: string | null;
  configStatus: "complete" | "incomplete" | "error";
  missingFields: string[];
  errors: string[];
}

/** A single edge connecting two nodes in a workflow graph. */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  type: string;
}

/** Full workflow detail including nodes and edges. */
export interface WorkflowDetail extends WfSummary {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** Body for creating a new workflow. */
export interface CreateWorkflowBody {
  name: string;
  description?: string;
}

/** Body for updating an existing workflow. */
export interface UpdateWorkflowBody {
  name?: string;
  description?: string;
}

/** Query parameters for listing workflows. */
export interface ListWorkflowsParams {
  page?: number;
  limit?: number;
  status?: WorkflowStatus;
  search?: string;
  /** Filter to workflows in a folder, by folder id or name (case-insensitive). */
  folder?: string;
}

// ============================================================================
// Nodes
// ============================================================================

/** Body for creating a new node in a workflow. */
export interface CreateNodeBody {
  type: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  parentId?: string;
}

/** Body for updating an existing node. */
export interface UpdateNodeBody {
  data: Record<string, unknown>;
}

/** Body for replacing the trigger node of a workflow. */
export interface ReplaceTriggerBody {
  type:
    | "webhookTrigger"
    | "agentInputTrigger"
    | "scheduleTrigger"
    | "pluginTrigger"
    | "manualTrigger"
    | "platformListenerTrigger";
}

/** Body for reloading dynamic properties of a node. */
export interface ReloadPropsBody {
  configuredProps?: Record<string, unknown>;
  dynamicPropsId?: string;
}

/** Response from reloading dynamic properties. */
export interface ReloadPropsResponse {
  parametersSetup: unknown[];
  dynamicPropsId: string | null;
  errors: string[];
}

// ============================================================================
// Branches
// ============================================================================

/** A branch within a conditional or router node. */
export interface Branch {
  id: string;
  name: string;
  description: string | null;
}

/** Body for creating a new branch on a node. */
export interface CreateBranchBody {
  name: string;
  description?: string;
}

/** Body for updating an existing branch. */
export interface UpdateBranchBody {
  name?: string;
  description?: string;
}

// ============================================================================
// Edges
// ============================================================================

/** Body for creating a new edge between nodes. */
export interface CreateEdgeBody {
  source: string;
  target: string;
  sourceHandle?: string;
  type?: "main" | "rewind";
}

// ============================================================================
// Overview
// ============================================================================

/** High-level overview of a workflow with node summaries. */
export interface WorkflowOverview {
  id: string;
  name: string;
  status: string;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    configStatus: "complete" | "incomplete" | "error";
    missingFields: string[];
    errors: string[];
  }>;
  edges: WorkflowEdge[];
}

/** Variables available to a node from upstream nodes. */
export interface AvailableVariable {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  properties: Array<{
    key: string;
    label: string;
    type: string;
  }>;
}

/** Output format definition for a node. */
export interface OutputFormat {
  format: unknown;
  source: "manual" | "lastExecution" | "default";
}

/** Validation report for a workflow. */
export interface ValidationReport {
  isValid: boolean;
  readyToPublish: boolean;
  readyToTest: boolean;
  nodeIssues: Array<{
    nodeId: string;
    nodeType: string;
    configStatus: string;
    missingFields: string[];
    errors: string[];
  }>;
  graphIssues: string[];
}

// ============================================================================
// Builder
// ============================================================================

/** Summary of a node type available in the workflow builder. */
export interface NodeTypeSummary {
  type: string;
  label: string;
  description: string;
  category: string;
}

/** Full schema for a node type including fields and connection rules. */
export interface NodeTypeSchema {
  type: string;
  label: string;
  description: string;
  category: string;
  fields: unknown[];
  configurationSteps: unknown[];
  connectionRules: {
    maxInputs: number;
    maxOutputs: number;
    canLoop: boolean;
    canMask: boolean;
  };
  defaultData: Record<string, unknown>;
}

/**
 * One filter field a prompt author can put on a platformListenerTrigger's
 * `filters.conditions[].field`.
 *
 * `key` is the field identifier (e.g. "deploymentId"). `operators` is the
 * subset of operator keywords valid on this field — using any other operator
 * will be rejected server-side. `options` carries static enum-select values
 * (e.g. channel types); `dataSource` is a hint for which list endpoint
 * resolves dynamic id values ("agents" → `GET /v1/agents`, "deployments" →
 * `GET /v1/deployments`).
 */
export interface PlatformListenerFilterFieldDef {
  key: string;
  label: string;
  fieldType: "agent-select" | "deployment-select" | "enum-select" | "number" | "text";
  options?: { value: string; label: string }[];
  dataSource?: "agents" | "deployments";
  operators: ("eq" | "neq" | "in" | "nin" | "gt" | "gte" | "lt" | "lte")[];
}

/**
 * One platform event type a `platformListenerTrigger` node can subscribe to.
 *
 * `filterFields` enumerates the valid `field` + `operator` pairs for the
 * trigger's `filters.conditions[]`. `samplePayload` shows the shape the
 * workflow receives at fire time.
 *
 * Backend filters out events flagged `comingSoon` in the registry, so every
 * entry here is guaranteed to actually fire today.
 */
export interface PlatformListenerEvent {
  eventType: string;
  label: string;
  category: string;
  description: string;
  filterFields: PlatformListenerFilterFieldDef[];
  samplePayload: Record<string, unknown>;
}

// ============================================================================
// Testing
// ============================================================================

/** Body for testing a single node. */
export interface TestNodeBody {
  input?: Record<string, unknown>;
}

/** Body for testing an entire workflow. */
export interface TestWorkflowBody {
  triggerData?: Record<string, unknown>;
}

/** Result of starting a test execution. */
export interface TestResult {
  executionId: string;
}

/** Status of a workflow execution. */
export interface ExecutionStatus {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  nodes: Array<{
    id: string;
    nodeId: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  startedAt: string;
  completedAt: string | null;
}

/** Execution result for a single node. */
export interface NodeExecutionResult {
  nodeId: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  logs: string[];
  startedAt: string | null;
  completedAt: string | null;
}

// ============================================================================
// Publish
// ============================================================================

/** Result of publishing a workflow. */
export interface PublishResult {
  id: string;
  status: "PUBLISHED";
}

/** Result of unpublishing a workflow. */
export interface UnpublishResult {
  id: string;
  status: "DRAFT";
}

/** Result of uploading a workflow icon. */
export interface IconResult {
  iconUrl: string;
}

// ============================================================================
// Batch
// ============================================================================

/** A branch to create within a batch node. */
export interface BatchBranch {
  ref: string;
  name: string;
  description?: string;
}

/** A node to create in a batch operation. */
export interface BatchNode {
  ref: string;
  type: string;
  label?: string;
  data?: Record<string, unknown>;
  parentId?: string;
  branches?: BatchBranch[];
}

/** An edge to create in a batch operation. */
export interface BatchEdge {
  source: string;
  target: string;
  sourceHandle?: string;
  type?: "main" | "rewind";
}

/** Body for batch-creating nodes, edges, and branches in a workflow. */
export interface BatchRequestBody {
  nodes?: BatchNode[];
  edges?: BatchEdge[];
  deleteEdges?: string[];
  /**
   * Optional: replace the workflow's trigger node as part of the same batch.
   * Same union as `ReplaceTriggerBody.type` — keep in sync.
   */
  triggerType?:
    | "webhookTrigger"
    | "agentInputTrigger"
    | "scheduleTrigger"
    | "pluginTrigger"
    | "manualTrigger"
    | "platformListenerTrigger";
}

/** Result of a batch operation, mapping refs to created UUIDs. */
export interface BatchResult {
  created: {
    nodes: Record<string, string>;
    edges: string[];
    branches: Record<string, string>;
  };
}
