import type { PageResponse } from "../types/common";
import type {
  CancelExecutionResponse,
  ExecutionDetail,
  ExecutionDiagnose,
  ExecutionNodeResult,
  ExecutionOutput,
  ExecutionPollResponse,
  ExecutionSummary,
  ExportExecutionResponse,
  ListExecutionsForWorkflowParams,
  ListExecutionsParams,
  RetryNodeResponse
} from "../types/workflow-executions";
import { BaseResource } from "./base-resource";

/**
 * Workflow execution resource. Accessed via `client.workflowExecutions`.
 *
 * One execution is one run of one workflow. Reads here are historical; to wait
 * on a run in progress use `poll()` or `pollByToken()`.
 */
export class WorkflowExecutionsResource extends BaseResource {
  /**
   * List real end-to-end runs across every workflow.
   *
   * A loop / do-while node records each pass of its body as its own execution
   * and the builder records single-node test runs the same way; both are
   * excluded unless opted in via `includeChildExecutions` / `includeTestRuns`,
   * so `meta.total` counts runs rather than iterations (NEX-3178). Each row
   * carries `executionType` and, for a loop pass, the `parentNodeId` of the
   * node that spawned it.
   *
   * @param params - Optional filters, scope flags and pagination.
   * @returns Paginated list of execution summaries.
   */
  async list(params?: ListExecutionsParams): Promise<PageResponse<ExecutionSummary>> {
    return this.http.requestPage<ExecutionSummary>("GET", "/workflows/executions", {
      query: params as Record<string, string | number | boolean | undefined>
    });
  }

  /**
   * List one workflow's executions. Same scoping as {@link list}.
   *
   * @param workflowId - Workflow UUID.
   * @param params - Optional filters, scope flags and pagination.
   * @returns Paginated list of execution summaries.
   */
  async listByWorkflow(
    workflowId: string,
    params?: ListExecutionsForWorkflowParams
  ): Promise<PageResponse<ExecutionSummary>> {
    return this.http.requestPage<ExecutionSummary>("GET", `/workflows/${workflowId}/executions`, {
      query: params as Record<string, string | number | boolean | undefined>
    });
  }

  /**
   * Get one execution, including its trigger and output payloads.
   *
   * @param executionId - Execution UUID.
   * @returns The execution.
   */
  async get(executionId: string): Promise<ExecutionDetail> {
    return this.http.request<ExecutionDetail>("GET", `/workflows/executions/${executionId}`);
  }

  /**
   * Walk an execution's node tree to find where it went wrong.
   *
   * @param executionId - Execution UUID.
   * @param options - Pass `{ verbose: true }` to include each node's full input
   *   and output. Without it those two keys are ABSENT from every node, not null.
   * @returns The node tree, with loop fan-out expanded up to five levels deep.
   */
  async diagnose(executionId: string, options?: { verbose?: boolean }): Promise<ExecutionDiagnose> {
    const query: Record<string, string> = {};
    if (options?.verbose) query.verbose = "true";
    return this.http.request<ExecutionDiagnose>(
      "GET",
      `/workflows/executions/${executionId}/diagnose`,
      { query }
    );
  }

  /**
   * Get one node's input, output, timings and error from an execution.
   *
   * Anything a node captured as console output is inside `output`. There is no
   * separate `logs` field — one was published until NEX-3864 and was `null` on
   * every node, because no model stores a per-node log array.
   *
   * @param executionId - Execution UUID.
   * @param nodeId - Graph node id — not a UUID.
   * @returns That node's result.
   */
  async getNodeResult(executionId: string, nodeId: string): Promise<ExecutionNodeResult> {
    return this.http.request<ExecutionNodeResult>(
      "GET",
      `/workflows/executions/${executionId}/nodes/${nodeId}`
    );
  }

  /**
   * Get just an execution's final output.
   *
   * @param executionId - Execution UUID.
   * @returns The output payload and its type discriminator.
   */
  async getOutput(executionId: string): Promise<ExecutionOutput> {
    return this.http.request<ExecutionOutput>("GET", `/workflows/executions/${executionId}/output`);
  }

  /**
   * Re-run one failed node inside a run that is STILL RUNNING.
   *
   * The node is re-queued on the execution's live in-memory executor, so this is
   * not a way to resurrect a finished run: once the execution reaches FAILED,
   * COMPLETED or CANCELLED its executor is gone and this rejects with a 400
   * ("Workflow execution is not running"). To re-run a node outside its original
   * execution, use the node-test surface instead.
   *
   * Rejects with 404 when the execution is not yours or the node names nothing
   * inside it, and with 400 when the node is not in `ERROR` or its type is not
   * retryable. Rejects with a 503 whose `code` is `"RUN_STATE_UNKNOWN"` when
   * the run changed while the retry was starting and the server could not read
   * its state: nothing was written and the node is still retryable, so the same
   * call is safe to send again.
   *
   * Read `code`, not `status`. Any other 503 says nothing about whether the
   * retry was admitted: the server's own `"SERVICE_UNAVAILABLE"` (it could not
   * get a database connection), or a proxy's or load balancer's 503, which this
   * client surfaces as `"HTTP_503"`. After one of those, read the node with
   * {@link getNodeResult} and compare it with what you read before the retry:
   * a `status` other than `ERROR` means the retry was admitted; `ERROR` with a
   * changed `completedAt` means it was admitted and ended in `ERROR` again, so
   * a new retry is a new attempt; `ERROR` with the same `completedAt` means it
   * was not admitted, so send it again. A second retry of an admitted failure
   * is refused with a 400, never run twice. The client does not replay a 503 on
   * a POST by itself.
   *
   * @param executionId - Execution UUID.
   * @param nodeId - Graph node id, or the execution-node row id. Either is
   *   accepted; the graph id is resolved first.
   * @returns Acknowledgement. The retry runs asynchronously — poll for progress.
   */
  async retryNode(executionId: string, nodeId: string): Promise<RetryNodeResponse> {
    return this.http.request<RetryNodeResponse>(
      "POST",
      `/workflows/executions/${executionId}/nodes/${nodeId}/retry`
    );
  }

  /**
   * Cancel a running execution and every execution it spawned (loop fan-out
   * iterations, nested loops). Works for PENDING, RUNNING and FAILED executions.
   *
   * @param executionId - Execution UUID.
   * @returns How many executions were cancelled. A non-cancellable state comes
   *   back as an HTTP error, not as `success: false`.
   */
  async cancel(executionId: string): Promise<CancelExecutionResponse> {
    return this.http.request<CancelExecutionResponse>(
      "POST",
      `/workflows/executions/${executionId}/cancel`
    );
  }

  /**
   * Poll an execution for its current status and output data.
   * Useful for checking if a webhook-triggered execution has completed.
   *
   * @param executionId - Execution UUID.
   * @returns Status and, once finished, the output payload.
   */
  async poll(executionId: string): Promise<ExecutionPollResponse> {
    return this.http.request<ExecutionPollResponse>(
      "GET",
      `/workflows/executions/${executionId}/poll`
    );
  }

  /**
   * Poll an execution by its polling token (returned by webhook triggers).
   *
   * @param pollingToken - Token from the trigger response.
   * @returns Status and, once finished, the output payload.
   */
  async pollByToken(pollingToken: string): Promise<ExecutionPollResponse> {
    return this.http.request<ExecutionPollResponse>(
      "GET",
      `/workflows/executions/poll/${pollingToken}`
    );
  }

  /**
   * Export an execution for download.
   *
   * @param executionId - Execution UUID.
   * @returns A URL to fetch the export from, and when it expires.
   */
  async export(executionId: string): Promise<ExportExecutionResponse> {
    return this.http.request<ExportExecutionResponse>(
      "POST",
      `/workflows/executions/${executionId}/export`
    );
  }
}
