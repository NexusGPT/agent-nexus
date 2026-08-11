// ============================================================================
// Execution status
// ============================================================================

/** Lifecycle status of a workflow execution. */
export type WorkflowExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

/**
 * What an execution row actually IS (NEX-3178).
 *
 * - `run` — a real end-to-end run of the workflow.
 * - `loop_iteration` — ONE pass of a loop / do-while body. `parentNodeId` names
 *   the container node in the workflow graph that spawned it.
 * - `node_test` — a builder-initiated single-node test run.
 *
 * Only `run` rows are listed by default; the other two need the matching
 * `include…` flag.
 */
export type WorkflowExecutionType = "run" | "loop_iteration" | "node_test";

// ============================================================================
// List params
// ============================================================================

/** Query parameters accepted by `client.workflowExecutions.list()`. */
export interface ListExecutionsParams {
  /** Restrict to a single workflow. */
  workflowId?: string;
  /** Restrict to one lifecycle status. */
  status?: WorkflowExecutionStatus;
  /** Lower bound on execution creation time. */
  startDate?: string;
  /** Upper bound on execution creation time. */
  endDate?: string;
  /** Page number (1-based). */
  page?: number;
  /** Items per page. */
  limit?: number;
  /** Sort key. Defaults to `"createdAt"` server-side. */
  sortBy?: "createdAt" | "status";
  /** Sort direction. Defaults to `"desc"` server-side. */
  order?: "asc" | "desc";
  /**
   * Also return loop / do-while body passes (`executionType: "loop_iteration"`).
   * Defaults to `false` server-side, so `meta.total` counts runs rather than
   * iterations (NEX-3178).
   */
  includeChildExecutions?: boolean;
  /**
   * Also return builder single-node test runs (`executionType: "node_test"`).
   * Defaults to `false` server-side.
   */
  includeTestRuns?: boolean;
}

/** Query parameters accepted by `client.workflowExecutions.listByWorkflow()`. */
export interface ListExecutionsForWorkflowParams {
  /** Page number (1-based). */
  page?: number;
  /** Items per page. */
  limit?: number;
  /** Restrict to one lifecycle status. */
  status?: WorkflowExecutionStatus;
  /** See {@link ListExecutionsParams.includeChildExecutions}. */
  includeChildExecutions?: boolean;
  /** See {@link ListExecutionsParams.includeTestRuns}. */
  includeTestRuns?: boolean;
}

// ============================================================================
// Execution (response shapes)
// ============================================================================

/** Per-status node tallies for one execution. */
export interface ExecutionNodeStatusCounts {
  /** Nodes that finished successfully. */
  completed: number;
  /** Nodes that errored. */
  failed: number;
  /** Nodes not started yet. */
  pending: number;
  /** Nodes currently executing. */
  running: number;
}

/** One row of `client.workflowExecutions.list()`. */
export interface ExecutionSummary {
  /** Execution UUID. */
  id: string;
  /** UUID of the workflow that ran. */
  workflowId: string;
  /** Workflow display name at read time, or `null` if the workflow is gone. */
  workflowName: string | null;
  /** Lifecycle status. */
  status: WorkflowExecutionStatus;
  /** ISO 8601 start timestamp, or `null` while still pending. */
  startedAt: string | null;
  /** ISO 8601 completion timestamp, or `null` while unfinished. */
  completedAt: string | null;
  /** Wall-clock duration in milliseconds, or `null` while unfinished. */
  duration: number | null;
  /** What this row is — see {@link WorkflowExecutionType}. */
  executionType: WorkflowExecutionType;
  /**
   * For a `loop_iteration`, the id of the loop / do-while node in the workflow
   * graph whose body this row ran. `null` for `run` and `node_test`.
   */
  parentNodeId?: string | null;
  /** Node tallies by status. */
  nodeStatusCounts: ExecutionNodeStatusCounts;
}

/** Response from `client.workflowExecutions.get()`. */
export interface ExecutionDetail extends ExecutionSummary {
  /** What started the execution (webhook, schedule, manual, ...), or `null`. */
  triggerType: string | null;
  /** Payload the trigger carried. Shape is workflow-specific. */
  triggerData: unknown;
  /** Failure message, or `null` when the execution did not fail. */
  error: string | null;
  /** Final output payload. Shape is workflow-specific. */
  outputData: unknown;
  /** Token for `pollByToken()`, or `null` when the trigger issued none. */
  pollingToken: string | null;
}

/** Response from `client.workflowExecutions.poll()` and `pollByToken()`. */
export interface ExecutionPollResponse {
  /** Execution UUID. */
  executionId: string;
  /** Lifecycle status at poll time. */
  status: WorkflowExecutionStatus;
  /** Final output payload, absent until the execution completes. */
  outputData: unknown;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 finish timestamp, or `null` while still running. */
  finishedAt: string | null;
}

/** Response from `client.workflowExecutions.getNodeResult()`. */
export interface ExecutionNodeResult {
  /** Graph node id. Not a UUID — it is the id carried in the workflow graph. */
  nodeId: string;
  /** Node type discriminator, or `null` when the node is gone from the graph. */
  nodeType: string | null;
  /** Node execution status. */
  status: string;
  /** Input the node received. Shape is node-specific. */
  input: unknown;
  /** Output the node produced. Shape is node-specific. */
  output: unknown;
  /** Log lines the node emitted, or `null` when none were captured. */
  logs: string[] | null;
  /** Node duration in milliseconds, or `null` while unfinished. */
  duration: number | null;
  /** ISO 8601 start timestamp, or `null` while unstarted. */
  startedAt: string | null;
  /** ISO 8601 completion timestamp, or `null` while unfinished. */
  completedAt: string | null;
  /** Failure message, or `null` when the node did not fail. */
  error: string | null;
}

/** Response from `client.workflowExecutions.getOutput()`. */
export interface ExecutionOutput {
  /** The execution's output payload. Shape is workflow-specific. */
  output: unknown;
  /** Discriminator describing how to read `output`, or `null`. */
  outputType: string | null;
}

/** Response from `client.workflowExecutions.retryNode()`. */
export interface RetryNodeResponse {
  /** Execution UUID the node belongs to. */
  executionId: string;
  /** Graph node id being retried. */
  nodeId: string;
  /** Always `"RETRYING"` — the retry is accepted asynchronously. */
  status: "RETRYING";
}

/**
 * Response from `client.workflowExecutions.cancel()`.
 *
 * A cancel terminates the addressed execution plus every execution it spawned
 * (loop fan-out iterations, nested loops), so `cancelledExecutions` is at least
 * 1 on success. Non-cancellable states arrive as HTTP errors, never as
 * `success: false`.
 */
export interface CancelExecutionResponse {
  /** Whether the cancel was applied. */
  success: boolean;
  /** Human-readable outcome. */
  message: string;
  /** How many executions were cancelled, including the addressed one. */
  cancelledExecutions: number;
}

/** Response from `client.workflowExecutions.export()`. */
export interface ExportExecutionResponse {
  /** URL to download the exported execution from. */
  url: string;
  /** ISO 8601 expiry of `url`, when the server sets one. */
  expiresAt?: string;
}

// ============================================================================
// Diagnose
// ============================================================================

/** One fan-out iteration of a loop node, as reported by `diagnose()`. */
export interface ExecutionDiagnoseLoopIteration {
  /** Iteration number, 1-based. */
  iteration: number;
  /** Status of the sub-execution, or `"UNKNOWN"` when its row is gone. */
  status: string;
  /** Nodes that ran inside this iteration. */
  nodes: ExecutionDiagnoseNode[];
}

/** One node in the tree `client.workflowExecutions.diagnose()` returns. */
export interface ExecutionDiagnoseNode {
  /** Graph node id. */
  nodeId: string;
  /** Node label from the graph, or `null`. */
  label: string | null;
  /** Node type discriminator, or `null`. */
  nodeType: string | null;
  /** Node status. Defaults to `"PENDING"` when the node never ran. */
  status: string;
  /** Node duration in milliseconds, or `null` when it cannot be computed. */
  duration: number | null;
  /** Failure message, or `null`. */
  error: string | null;
  /**
   * JSON-stringified output. Cut to the first 100 characters with a `…`
   * appended, so a truncated summary is 101 characters, not 100. `null` when
   * the node produced no output.
   */
  outputSummary: string | null;
  /**
   * Full node input. PRESENT ONLY when `diagnose()` was called with
   * `{ verbose: true }` — otherwise the key is absent from the payload, not null.
   */
  input?: unknown;
  /** Full node output. Same `verbose` condition as `input`. */
  output?: unknown;
  /**
   * One entry per loop iteration, or `null` for a node that is not a loop.
   * Recursion stops after 5 levels, so a deeper loop reports `null` here.
   */
  loopIterations: ExecutionDiagnoseLoopIteration[] | null;
}

/** Response from `client.workflowExecutions.diagnose()`. */
export interface ExecutionDiagnose {
  /** Execution UUID. */
  executionId: string;
  /** Workflow display name, or `null` if the workflow is gone. */
  workflowName: string | null;
  /** Execution status. */
  status: string;
  /** Wall-clock duration in milliseconds, or `null` while unfinished. */
  duration: number | null;
  /** ISO 8601 start timestamp, or `null` while pending. */
  startedAt: string | null;
  /** ISO 8601 completion timestamp, or `null` while unfinished. */
  completedAt: string | null;
  /**
   * What this row is — see {@link WorkflowExecutionType}. A loop pass otherwise
   * reads like a truncated run: few nodes, no trigger, `loopIterations: null`.
   */
  executionType: WorkflowExecutionType;
  /**
   * For a `loop_iteration`, the loop / do-while node whose body this row ran.
   * `null` otherwise.
   */
  parentNodeId?: string | null;
  /** First error found walking `nodes` depth-first, or `null`. */
  error: string | null;
  /**
   * Node counts keyed by whatever status strings the nodes carry, summed across
   * loop iterations. NOT the fixed four-key {@link ExecutionNodeStatusCounts}
   * that {@link ExecutionSummary} uses.
   */
  nodeStatusCounts: Record<string, number>;
  /** The top-level node tree. */
  nodes: ExecutionDiagnoseNode[];
}
