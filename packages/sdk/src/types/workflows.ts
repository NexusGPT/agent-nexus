import type { WorkflowExecutionStatus } from "./workflow-executions";

/**
 * WIRE SHAPES for `client.workflows.*`.
 *
 * The shapes are re-declared here rather than imported from the monorepo's
 * shared contracts package, because this package is published standalone: that
 * package pulls Zod and the generated Prisma enums, and a consumer of
 * `@agent-nexus/sdk` has neither.
 *
 * A COMMENT ASKING FOR LOCKSTEP IS NOT A MECHANISM.
 * `workflows-wire-types.conformance.ts` is the mechanism — it imports the real
 * v1 schemas and fails `pnpm typecheck` when a declaration here stops matching
 * one, so a contract change lands as a compile error rather than as a support
 * ticket.
 *
 * Not every route has a v1 response schema. Where none exists the doc comment
 * names the backend producer the shape was read off, which is also how you can
 * tell which declarations the conformance gate cannot check.
 */

// ============================================================================
// Workflow CRUD
// ============================================================================

/**
 * Workflow lifecycle status, as it appears on a RESPONSE.
 *
 * ⚠️ All four are reachable. `PAUSED` is what a preset-materialised workflow
 * lands on when its configuration is disabled — handle it in any exhaustive
 * switch.
 *
 * The `status` FILTER accepted by {@link ListWorkflowsParams} is a different,
 * narrower set — see {@link WorkflowStatusFilter}. The API treats them
 * separately, so collapsing them into one type would make one of the two wrong.
 */
export type WorkflowStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED" | "PAUSED";

/** The subset of {@link WorkflowStatus} `GET /workflows` accepts as a filter. */
export type WorkflowStatusFilter = "DRAFT" | "PUBLISHED" | "ARCHIVED";

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
  /** Uploaded workflow icon, or `null` when none has been set. */
  iconUrl: string | null;
  nodeCount: number;
  /** Folder the workflow belongs to, or `null` if unassigned. */
  folder: FolderRef | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A node in a workflow GRAPH — an element of {@link WorkflowDetail.nodes}.
 *
 * There is no `position`: layout coordinates belong to the canvas and the API
 * never returns them. There is no configuration status either — that is
 * computed on demand and rides on {@link NodeResponse}, which is what the node
 * routes return.
 */
export interface WorkflowNode {
  id: string;
  type: string;
  /**
   * The node's configuration, keyed by field name. Its shape is specific to
   * `type` — call `client.workflows.getNodeTypeSchema(type)` for the fields a
   * given node type accepts. Internal runtime state is stripped before this is
   * returned.
   */
  data: Record<string, unknown>;
  /** Present only when the node cannot be deleted — the mapper sets it exclusively for `false`. */
  deletable?: boolean;
  /** Id of the loop / doWhile container this node sits inside. Absent when unscoped. */
  parentId?: string;
}

/**
 * What `createNode` / `getNode` / `updateNode` return: a graph node with its
 * configuration status spread on top. FLAT — the status fields sit on the node
 * itself, not under a nested key.
 */
export interface NodeResponse extends WorkflowNode {
  configStatus: "complete" | "incomplete" | "error";
  missingFields: string[];
  errors: string[];
  /**
   * Auto-created start/end nodes, present only for scope nodes (loop /
   * doWhile). A child is always scoped, so its `parentId` is required, and it is
   * never marked undeletable.
   */
  children?: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
    /** Required, not optional: a child is always scoped to its container. */
    parentId: string;
  }>;
}

/**
 * An edge connecting two nodes in a workflow graph.
 *
 * Both handles are OPTIONAL and are never sent as `null`: the mapper omits the
 * key when the stored edge has no handle, so test for presence rather than for
 * `null`. Extra React Flow fields on the stored edge are dropped by the mapper
 * and so are absent here.
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** `"main"` unless the edge is a rewind link; the mapper defaults it. */
  type: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/**
 * Full workflow detail — what create / get / update / duplicate return.
 *
 * Detail and summary are different payloads, which is why this does NOT extend
 * {@link WfSummary}: detail carries the graph, `agentInputSchema`, `data` and
 * the published snapshot, and it sends neither `nodeCount` nor `folder`. Call
 * `list()` when you need those.
 */
export interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  triggerType: string | null;
  iconUrl: string | null;
  /**
   * The inputs an agent must supply when it runs this workflow.
   *
   * On a PUBLISHED workflow this is the LIVE contract — derived from the
   * `agentInputTrigger` in {@link publishedNodes}, the graph a calling agent
   * actually invokes — so a trigger edit made after publishing does NOT appear
   * here until the workflow is unpublished and published again. That edit is on
   * this same payload, under the trigger node's `data.parameters` in
   * {@link nodes}. On a DRAFT there is no published graph, so this tracks the
   * draft trigger.
   *
   * Opaque to the API otherwise, which returns it verbatim. `null` when the
   * workflow accepts no agent input — the key is always present.
   */
  agentInputSchema: unknown;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** Last-published graph snapshot. `null`, not `[]`, until a first publish. */
  publishedNodes: WorkflowNode[] | null;
  /** Last-published edge snapshot. `null`, not `[]`, until a first publish. */
  publishedEdges: WorkflowEdge[] | null;
  /**
   * Editor state stored alongside the graph (viewport, canvas metadata). Opaque
   * to the API and not part of execution. `null` when the workflow has none —
   * the key is always present.
   */
  data: unknown;
  createdAt: string;
  updatedAt: string;
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

/**
 * Query parameters for listing workflows.
 *
 * A type alias rather than an interface, deliberately: only an alias gets an
 * implicit index signature, which is what lets it be handed to the HTTP client's
 * `query` bag directly instead of through a cast.
 */
export type ListWorkflowsParams = {
  page?: number;
  limit?: number;
  status?: WorkflowStatusFilter;
  search?: string;
  /** Filter to workflows in a folder, by folder id or name (case-insensitive). */
  folder?: string;
};

/**
 * What `DELETE /workflows/:id` returns.
 *
 * ⚠️ Deleting a workflow ARCHIVES it, and the reply says so. This is not the
 * SDK's generic `DeleteResponse`: there is no `deleted` field on this payload,
 * so branch on `status` instead.
 *
 * Producer: `WorkflowRepository.archive` (no v1 response schema).
 */
export interface WorkflowArchiveResult {
  id: string;
  status: "ARCHIVED";
  /** ISO timestamp. Always present. */
  archivedAt: string;
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

/**
 * Body for updating an existing node. At least one field must be supplied, or
 * the request is rejected with a 400.
 *
 * `parentId` moves the node into a loop / doWhile container, or out of any loop
 * when `null`. Omit it to leave the node's scope unchanged.
 */
export interface UpdateNodeBody {
  data?: Record<string, unknown>;
  parentId?: string | null;
  /**
   * NOT WRITABLE — declared only so that sending one is a compile error rather
   * than a discarded key (NEX-4075).
   *
   * A node's type is fixed when it is created. This body used to STRIP a
   * top-level `type`: `{type: "manualTrigger", data: {…}}` answered 200 with the
   * old type in the same response, so the request reported success for the one
   * thing it did not do. The server now refuses it by name; `type?: undefined`
   * is the same refusal a release earlier, at the keyboard.
   *
   * To change the workflow's trigger, call `workflows.replaceTrigger` —
   * `PUT /workflows/:id/trigger` — which replaces the node and reconnects its
   * edges. Any other node's type is changed by creating the replacement and
   * deleting the old one.
   */
  type?: undefined;
}

/**
 * What `DELETE /workflows/:id/nodes/:nodeId` returns — an enumeration of the
 * damage, because on a container the damage is not one node.
 *
 * Deleting a `loop` or `doWhile` deletes every node scoped inside it (and
 * inside any container nested in it), plus every edge touching any of them —
 * the container's own inbound and outbound edges included, and those connect
 * nodes that are still there. The route used to answer `204` with no body, so
 * six nodes and six edges could go and the only way to find out was to `get()`
 * the workflow before and after (NEX-4047).
 *
 * Producer: `NodeDeleteResultSchema` in `@nexus/types/public-api-v1`.
 */
export interface NodeDeleteResult {
  /** Every node removed, the requested one first, then its body in graph order. */
  deletedNodeIds: string[];
  /** Every edge removed, including the ones crossing the container's boundary. */
  deletedEdgeIds: string[];
  /**
   * Nodes that SURVIVED and lost an edge to this deletion — the graph either
   * side of what was removed. `validate()` may now call these `DISCONNECTED_NODE`.
   */
  severedNodeIds: string[];
}

/** Trigger node types installable through the public API. */
export type ApiTriggerType =
  | "webhookTrigger"
  | "agentInputTrigger"
  | "scheduleTrigger"
  | "pluginTrigger"
  | "manualTrigger"
  | "platformListenerTrigger";

/** Body for replacing the trigger node of a workflow. */
export interface ReplaceTriggerBody {
  type: ApiTriggerType;
}

/**
 * What `PUT /workflows/:id/trigger` returns — the new trigger node plus the
 * edges that were rewired onto it. Re-read the workflow with `get()` if you
 * need the whole graph afterwards.
 *
 * Producer: `WorkflowNodeService.replaceTrigger` (no v1 response schema).
 */
export interface ReplaceTriggerResult {
  node: NodeResponse;
  /** Edges reconnected to the new trigger. Always present, possibly empty. */
  reconnectedEdges: Array<{ id: string; source: string; target: string }>;
}

/** Body for reloading dynamic properties of a node. */
export interface ReloadPropsBody {
  configuredProps?: Record<string, unknown>;
  dynamicPropsId?: string;
}

/**
 * Response from reloading dynamic properties.
 *
 * `parametersSetup` is an object keyed by field name, not an array. `errors`
 * comes verbatim from the Pipedream SDK and has no shape the backend enforces,
 * so its elements are `unknown` rather than strings.
 *
 * Producer: `WorkflowNodeService.reloadDynamicProps` (no v1 response schema).
 */
export interface ReloadPropsResponse {
  parametersSetup: Record<string, unknown>;
  dynamicPropsId: string | null;
  errors: unknown[];
}

// ============================================================================
// Branches
// ============================================================================

/**
 * A branch within a conditional or router node.
 *
 * This is the STORED branch shape, which is what three call sites return:
 * `listBranches` reads the branches straight out of the node's Json column,
 * `updateBranch` returns the stored object with the patched keys written over
 * it, and `createBranch` returns one this API just built.
 *
 * ⚠️ The nullability is set by the loosest of those, not the strictest. Branches
 * live in `Workflow.nodes`, which no schema enforces, so a branch the canvas
 * wrote carries whatever the canvas put there. `createBranch` is the narrow
 * case — it coalesces a missing description to `""` and always sets
 * `nextStep: null` — but narrowing this type to match it would promise, for
 * every stored branch, a guarantee only the create path makes.
 *
 * Producers: `WorkflowNodeService.createBranch` / `updateBranch` /
 * `listBranches` (no v1 response schema).
 */
export interface Branch {
  id: string;
  name: string;
  description: string | null;
  /**
   * Id of the node this branch hands control to, or `null` while unwired.
   *
   * Optional because branches live in the `Workflow.nodes` Json column, which
   * no schema enforces — a branch written before this field existed has none.
   */
  nextStep?: string | null;
}

/**
 * Response of `listBranches`.
 *
 * The route does NOT answer with a bare array. It answers with this wrapper,
 * and `Promise<Branch[]>` was a description of a shape the server has never
 * sent — so the branch table was handed an object and rendered nothing.
 */
export interface BranchList {
  branches: Branch[];
  availableHandles: { outputs: string[] };
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

/**
 * High-level overview of a workflow with node summaries.
 *
 * The node summaries carry `missingFields` but no `errors` array — the service
 * computes one and deliberately drops it here. Call `validate()` for the full
 * error set.
 *
 * Producer: `WorkflowOverviewService.getOverview` (no v1 response schema).
 * `POST /workflows/:id/layout` replies with this same payload.
 */
export interface WorkflowOverview {
  id: string;
  name: string;
  status: WorkflowStatus;
  nodeCount: number;
  edgeCount: number;
  nodes: Array<{
    id: string;
    type: string;
    /** The node's label, falling back to its type. Always present. */
    label: string;
    configStatus: "complete" | "incomplete" | "error";
    missingFields: string[];
  }>;
  edges: WorkflowEdge[];
  readyToTest: boolean;
  readyToPublish: boolean;
}

/**
 * One variable a node can reference from an upstream node.
 *
 * Recursive: `children` is the same shape and is always an array, possibly
 * empty.
 *
 * Producer: `WorkflowOverviewService.getAvailableVariables` (no v1 schema).
 */
export interface AvailableVariable {
  /** Dotted path within the source node's output. */
  path: string;
  /** The `{{...}}` reference to paste into a field. */
  reference: string;
  /** JSON type of the value, defaulting to `"object"`. */
  type: string;
  label: string;
  /** Id of the node the variable comes from. */
  source: string;
  children: AvailableVariable[];
}

/** What `GET .../available-variables` returns — an object wrapping the list. */
export interface AvailableVariables {
  variables: AvailableVariable[];
}

/**
 * Output format definition for a node.
 *
 * `source` says where the shape came from: `"manual"` when the node declares its
 * own `outputFormat`, `"nodeType"` when it falls back to the type's default.
 *
 * ⚠️ `schema` is `null` for an output node, which has no default shape — the type
 * says so now rather than only the prose. `unknown` was not unsound (`null`
 * inhabits it) but it let a consumer discover the null by crashing:
 * `typeof null === "object"`, so the obvious guard admits it.
 *
 * Producer: `WorkflowOverviewService.getOutputFormat` — the manual arm is
 * truthy-guarded and forwards the node's stored JSON Schema verbatim; the
 * nodeType arm returns an object for every node type except `outputNode`.
 */
export interface OutputFormat {
  schema: Record<string, unknown> | null;
  source: "manual" | "nodeType";
}

/** One entry in {@link ValidationReport.errors}. */
export interface ValidationError {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  /** The offending field, or `"variables"` for a bad `{{...}}` reference. */
  field: string;
  message: string;
  severity: "critical" | "error";
}

/**
 * One entry in {@link ValidationReport.warnings}.
 *
 * `nodeLabel` is absent on workflow-level warnings, which report
 * `nodeId: "workflow"`.
 */
export interface ValidationWarning {
  nodeId: string;
  nodeType: string;
  nodeLabel?: string;
  message: string;
}

/** Per-node roll-up in {@link ValidationReport.nodeStatuses}. */
export interface ValidationNodeStatus {
  status: "error" | "warning" | "ok";
  /** Present only on the `"error"` status. */
  errors?: string[];
  /** Present only on the `"warning"` status. */
  warnings?: string[];
  /** Present only for nodes carrying an unresolvable `{{...}}` reference. */
  variableErrors?: Array<{ reference: string; reason: string }>;
}

/**
 * Validation report for a workflow.
 *
 * Findings are split five ways: `errors` and `warnings` are flat lists,
 * `nodeStatuses` is the same information rolled up per node, `graphIssues`
 * covers connectivity, and `variableIssues` covers unresolvable `{{...}}`
 * references.
 *
 * Producer: `WorkflowOverviewService.validateWorkflow` (no v1 schema).
 */
export interface ValidationReport {
  isValid: boolean;
  readyToTest: boolean;
  readyToPublish: boolean;
  hasCriticalErrors: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  /** Keyed by node id. */
  nodeStatuses: Record<string, ValidationNodeStatus>;
  graphIssues: Array<{
    /**
     * `MULTIPLE_TRIGGERS` names a workflow holding more than one live trigger:
     * a run starts from one of them and silently skips the rest (NEX-4062).
     * `INVALID_EDGE` names an edge publish refuses; it was already produced here
     * and missing from this union.
     */
    type: "DISCONNECTED_NODE" | "ORPHANED_NODE" | "INVALID_EDGE" | "MULTIPLE_TRIGGERS";
    nodeId: string;
    message: string;
  }>;
  variableIssues: Array<{
    nodeId: string;
    nodeType: string;
    nodeLabel: string;
    invalidReferences: Array<{ reference: string; reason: string }>;
  }>;
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

/** One field a node type accepts. */
export interface FieldDefinition {
  name: string;
  /**
   * The field's shape, as PROSE. `'"hours" | "minutes" | "days"'` reads like a
   * union and is a documentation string — read `values` to act on it.
   */
  type: string;
  description: string;
  default?: unknown;
  /**
   * Every value the server accepts for this field, when that set is closed.
   *
   * Present: a write carrying anything else is refused with
   * `400 NODE_FIELD_VALUE_INVALID`. Absent: the field is not value-checked,
   * which is NOT "any value works" — it means nothing on the server can say
   * which values do.
   *
   * The empty string is always accepted regardless of this list: it is the
   * ordinary mid-configuration state. The list may be WIDER than `type` names
   * (a legacy alias that still resolves), never narrower.
   */
  values?: string[];
}

/** One step in a node type's guided configuration. */
export interface ConfigurationStep {
  step: number;
  action: string;
  field: string;
  endpoint?: string;
  trigger?: string;
  description: string;
}

/** How many edges a node type accepts and emits, and where it may sit. */
export interface ConnectionRules {
  inputs: { min: number; max: number };
  outputs: { min: number; max: number; note?: string };
  canBeInsideLoop: boolean;
  canBeMasked: boolean;
  /** Node type auto-created as this node's children, when it is a scope node. */
  children?: string;
}

/** One input field of a `nexusApi` action. */
export interface NexusApiActionField {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  constraints?: {
    allowedValues: Array<string | number>;
    allowedOptions: Array<{ label: string; value: string | number }>;
  };
}

/**
 * The resource families a `nexusApi` node can act on.
 *
 * Enumerated rather than left as `string` because the payload enumerates them:
 * the catalog is built from a fixed server-side list, and `workflows-wire-types
 * .conformance.ts` compares this union against it, so adding a family upstream
 * is a compile error here rather than a silently unnameable value.
 */
export type NexusApiCategory =
  | "agents"
  | "deployments"
  | "tasks"
  | "collections"
  | "documents"
  | "documentTemplates"
  | "emulator"
  | "inbox"
  | "workflows"
  | "executions"
  | "workspace";

/** The `(category, action)` catalog surfaced on the `nexusApi` node type. */
export interface NexusApiActionCatalog {
  description: string;
  categories: Array<{
    category: NexusApiCategory;
    label: string;
    actions: Array<{
      action: string;
      label: string;
      description: string;
      inputSchema: Record<string, NexusApiActionField>;
      /** Recursive `DataSchemaType`; only the discriminant is pinned. */
      outputFormat: { [key: string]: unknown; type: string };
    }>;
  }>;
}

/** Shape a trigger node emits downstream, when it is meaningfully fixed. */
export interface RunOutputShape {
  description: string;
  fields: FieldDefinition[];
}

/**
 * Full schema for a node type.
 *
 * `fields` groups the definitions by whether they are required, optional or
 * read-only. `defaultData` is what a freshly created node of this type carries.
 */
export interface NodeTypeSchema {
  type: string;
  label: string;
  description: string;
  category: string;
  fields: {
    required: FieldDefinition[];
    optional: FieldDefinition[];
    readOnly: string[];
    parametersSetup?: {
      description: string;
      entrySchema?: Record<string, string>;
    };
  };
  defaultData: Record<string, unknown>;
  connectionRules: ConnectionRules;
  configurationSteps: ConfigurationStep[];
  branchSchema?: Record<string, string>;
  logicSchema?: Record<string, unknown>;
  /** Present only on the `nexusApi` node type. */
  actionCatalog?: NexusApiActionCatalog;
  /** Present only on trigger node types. */
  runOutputSchema?: RunOutputShape;
  /**
   * The node type's authoring guide — one CommonMark document, served verbatim.
   *
   * Covers what no other field on this response can: which node type to pick
   * over which, a minimal configuration that actually RUNS, and the writes the
   * platform accepts and then fails at run time. Every other field here is
   * structured registry data a consumer could already reconstruct.
   *
   * ABSENT rather than empty when a type has no guide yet — `""` would read as
   * "nothing worth saying about this type", which is never the case.
   */
  guide?: string;
  /**
   * Present ONLY on a node type the workflow engine cannot dispatch, carrying
   * the reason and the working alternative where one exists.
   *
   * Four node types shipped registered-and-unexecutable (NEX-3972): offered by
   * `listNodeTypes()` with a full label and description, accepted by
   * `createNode()` at 201, reported `configStatus: "complete"`, and passed
   * `validate()` as ready to publish — then threw `Node type <type> not found`
   * on every execution. Every surface a caller could read before running one
   * said it was healthy.
   *
   * So this is the field to branch on BEFORE offering a type to a user or
   * writing a node of it. `createNode()` now refuses one with
   * `NODE_TYPE_NOT_EXECUTABLE`, and `validate()` reports a critical error for a
   * stored node of that type.
   *
   * ABSENT rather than `{ reason: "" }` or a `false` flag when the type CAN run,
   * so the check is a presence test with no third state to interpret.
   */
  nonExecutable?: { reason: string };
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

/**
 * Body for testing a single node.
 *
 * `input` injects mock outputs for the node's UPSTREAM nodes, keyed by the
 * upstream node ID or — for nodes with named inputs (e.g. customScript) — the
 * input's `variableName`. Unknown keys are rejected with a 400 error.
 *
 * @example { input: { "upstream-node-id": { rasp_note: "X" } } }
 */
export interface TestNodeBody {
  input?: Record<string, unknown>;
}

/** Body for testing an entire workflow. */
export interface TestWorkflowBody {
  triggerData?: Record<string, unknown>;
  /**
   * Per-node sample caps for this test run, mapping a node id to the maximum
   * number of array items that node may emit/iterate. Used to scope a test
   * (e.g. iterate a loop over 5 items instead of 429) without editing the
   * workflow definition. Only honored on test runs.
   */
  sampleConfig?: Record<string, number>;
}

/**
 * Result of a single-node test.
 *
 * `status` is the outcome: `"COMPLETED"` when the node ran, `"FAILED"` when it
 * threw (the error envelope is then in `data` as `{error, errorDetails,
 * timestamp}`), and `"PENDING"` when the run went asynchronous and `data` is
 * `null`. A `"FAILED"` run leaves the node's stored `outputFormat` and
 * `runOutput` untouched — only `testExecutionId` moves — so the node keeps
 * whatever contract its last successful test published (NEX-4066).
 *
 * Producer: `WorkflowTestingService.testNode` (no v1 response schema).
 */
export interface TestNodeResult {
  executionId: string;
  status: string;
  data: unknown;
  /**
   * What the node reported ABOUT the run, beside `data` rather than inside it
   * (NEX-4065) — a `smartAction` node's `chosenTool` / `chosenToolId` /
   * `chosenAction`. `null` on the async arm, and for every node type that
   * records nothing about a run.
   */
  metadata: unknown;
}

/**
 * Result of starting a whole-workflow test. `status` is always `"RUNNING"`;
 * every other outcome is thrown as an error.
 *
 * Producer: `WorkflowTestingService.testWorkflow` (no v1 response schema).
 */
export interface TestWorkflowResult {
  executionId: string;
  status: "RUNNING";
}

/**
 * Webhook trigger URLs plus the last payload a test event delivered.
 * Returned by `getWebhookTestPayload`.
 *
 * A discriminated union on `received`: check that flag first, and `payload`,
 * `source` and `message` all narrow to what the server actually sent.
 */
export type WebhookTestPayload =
  | {
      /** Production webhook URL (fires the published workflow). */
      webhookUrl: string;
      /** Test webhook URL (fire a test event here, then read it back). */
      testWebhookUrl: string;
      received: true;
      /** Where the payload came from. */
      source: "test_event" | "example_data";
      payload: Record<string, unknown>;
      message?: never;
    }
  | {
      webhookUrl: string;
      testWebhookUrl: string;
      received: false;
      source: null;
      payload: null;
      /** Hint explaining what to do to capture one. */
      message: string;
    };

/**
 * Status of a workflow execution.
 *
 * ⚠️ Per-node state arrives as `nodeResults`, a MAP KEYED BY NODE ID — not an
 * array. Use `Object.entries(status.nodeResults)` to walk it.
 *
 * Producer: `WorkflowTestingService.getExecutionStatus` (no v1 schema).
 */
export interface ExecutionStatus {
  id: string;
  status: WorkflowExecutionStatus;
  /** ISO timestamp. Always present — falls back to the row's creation time. */
  startedAt: string;
  completedAt: string | null;
  nodeResults: Record<
    string,
    {
      status: string;
      startedAt: string | null;
      completedAt: string | null;
    }
  >;
}

/**
 * Execution result for a single node.
 *
 * `duration` is milliseconds. ⚠️ `logs` is always empty — the handler hardcodes
 * it, so it is never a source of node output; read `output` and `error`.
 *
 * Producer: `WorkflowTestingService.getNodeExecutionResult` (no v1 schema).
 */
export interface NodeExecutionResult {
  nodeId: string;
  status: string;
  input: unknown;
  output: unknown;
  /**
   * What the node reported ABOUT the run, beside `output` rather than inside it
   * (NEX-4065) — a `smartAction` node's chosen candidate, a loop node's
   * iteration ids. `null` when the node recorded nothing about its run.
   */
  metadata: unknown;
  error: { message: string } | null;
  /** Always empty — the handler does not collect node logs. */
  logs: string[];
  duration: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Result of cancelling a running execution. Poll {@link ExecutionStatus} if you
 * need the execution's state afterwards.
 *
 * Producer: `WorkflowExecutionService.cancelWorkflowExecution` (no v1 schema).
 */
export interface StopExecutionResult {
  success: boolean;
  message: string;
  cancelledExecutions: number;
}

// ============================================================================
// Publish
// ============================================================================

/**
 * Result of publishing a workflow, carrying the snapshot that was published.
 *
 * Producer: `WorkflowRepository.publish` (no v1 response schema).
 */
export interface PublishResult {
  id: string;
  status: "PUBLISHED";
  publishedNodes: WorkflowNode[];
  publishedEdges: WorkflowEdge[];
  updatedAt: string;
}

/**
 * Result of unpublishing a workflow: a bare message. ⚠️ There is no `id` and no
 * `status` on this payload — re-read the workflow if you need its new state.
 *
 * Producer: `WorkflowRepository.unpublish` (no v1 response schema).
 */
export interface UnpublishResult {
  message: string;
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
  /** Optional: replace the workflow's trigger node as part of the same batch. */
  triggerType?: ApiTriggerType;
}

/** Result of a batch operation, mapping refs to created UUIDs. */
export interface BatchResult {
  created: {
    nodes: Record<string, string>;
    edges: string[];
    branches: Record<string, string>;
  };
}
