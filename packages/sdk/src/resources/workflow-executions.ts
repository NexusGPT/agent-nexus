import type { PageResponse } from "../types/common";
import { BaseResource } from "./base-resource";

export class WorkflowExecutionsResource extends BaseResource {
  async list(params?: {
    workflowId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: string;
  }): Promise<PageResponse<any>> {
    const { data, meta } = await this.http.requestWithMeta<any[]>("GET", "/workflows/executions", {
      query: params as Record<string, string | number | undefined>
    });
    return { data, meta: meta! };
  }

  async listByWorkflow(
    workflowId: string,
    params?: { page?: number; limit?: number; status?: string }
  ): Promise<PageResponse<any>> {
    const { data, meta } = await this.http.requestWithMeta<any[]>(
      "GET",
      `/workflows/${workflowId}/executions`,
      {
        query: params as Record<string, string | number | undefined>
      }
    );
    return { data, meta: meta! };
  }

  async get(executionId: string): Promise<any> {
    return this.http.request<any>("GET", `/workflows/executions/${executionId}`);
  }

  async diagnose(executionId: string, options?: { verbose?: boolean }): Promise<any> {
    const query: Record<string, string> = {};
    if (options?.verbose) query.verbose = "true";
    return this.http.request<any>("GET", `/workflows/executions/${executionId}/diagnose`, {
      query
    });
  }

  async getNodeResult(executionId: string, nodeId: string): Promise<any> {
    return this.http.request<any>("GET", `/workflows/executions/${executionId}/nodes/${nodeId}`);
  }

  async getOutput(executionId: string): Promise<any> {
    return this.http.request<any>("GET", `/workflows/executions/${executionId}/output`);
  }

  async retryNode(executionId: string, nodeId: string): Promise<any> {
    return this.http.request<any>(
      "POST",
      `/workflows/executions/${executionId}/nodes/${nodeId}/retry`
    );
  }

  /**
   * Poll an execution for its current status and output data.
   * Useful for checking if a webhook-triggered execution has completed.
   */
  async poll(executionId: string): Promise<any> {
    return this.http.request<any>("GET", `/workflows/executions/${executionId}/poll`);
  }

  /**
   * Poll an execution by its polling token (returned by webhook triggers).
   */
  async pollByToken(pollingToken: string): Promise<any> {
    return this.http.request<any>("GET", `/workflows/executions/poll/${pollingToken}`);
  }

  async export(executionId: string): Promise<any> {
    return this.http.request<any>("POST", `/workflows/executions/${executionId}/export`);
  }
}
