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
   * List executions across every workflow.
   *
   * @param params - Optional filters and pagination.
   * @returns Paginated list of execution summaries.
   */
  async list(params?: ListExecutionsParams): Promise<PageResponse<ExecutionSummary>> {
    return this.http.requestPage<ExecutionSummary>("GET", "/workflows/executions", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * List one workflow's executions.
   *
   * @param workflowId - Workflow UUID.
   * @param params - Optional filters and pagination.
   * @returns Paginated list of execution summaries.
   */
  async listByWorkflow(
    workflowId: string,
    params?: ListExecutionsForWorkflowParams
  ): Promise<PageResponse<ExecutionSummary>> {
    return this.http.requestPage<ExecutionSummary>("GET", `/workflows/${workflowId}/executions`, {
      query: params as Record<string, string | number | undefined>
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
   * Get one node's input, output and logs from an execution.
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
   * Re-run one failed node.
   *
   * @param executionId - Execution UUID.
   * @param nodeId - Graph node id.
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
