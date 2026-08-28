import type {
  AgentEvalBatch,
  CreateAgentEvalBatchBody,
  ListAgentEvalBatchesParams
} from "../types/agent-evals";
import type { PageResponse } from "../types/common";
import { BaseResource } from "./base-resource";

/**
 * Batches. Accessed via `client.agentEvals.batches`.
 *
 * A batch runs ONE evaluation recipe over MANY stored conversations: you give it
 * a filter, and it fans out a child run per conversation the filter selects.
 *
 * ⚠️ Unlike a single run, a batch's configs must be FULLY RESOLVED — the fan-out
 * copies them onto every child verbatim and never resolves a template again. A
 * `templateId` alone will not be expanded here.
 *
 * 🔴 There is no `delete` and no `abort`: the v1 contract declares neither, so
 * this resource has three methods and stops. A batch whose filter is too broad
 * spends per child run, which is what `budgetCapUsdTenThousandths` is for.
 */
export class AgentEvalBatchesResource extends BaseResource {
  /**
   * Create a batch and fan it out over the conversations its filter selects.
   *
   * @param body - The selection filter plus fully-resolved judges and summariser.
   * @returns The created batch, with `totalRuns` set to the fan-out size.
   */
  async create(body: CreateAgentEvalBatchBody): Promise<AgentEvalBatch> {
    return this.http.request<AgentEvalBatch>("POST", "/agent-evals/batches", { body });
  }

  /**
   * List batches, newest first.
   *
   * @param params - Optional status filter and pagination.
   * @returns One page of batches.
   */
  async list(params?: ListAgentEvalBatchesParams): Promise<PageResponse<AgentEvalBatch>> {
    return this.http.requestPage<AgentEvalBatch>("GET", "/agent-evals/batches", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get one batch, including its live progress counters.
   *
   * @param batchId - Batch UUID.
   * @returns The batch. Read `completedRuns` / `failedRuns` against `totalRuns`
   *   for progress; `aggregateJson` is populated once the batch completes.
   */
  async get(batchId: string): Promise<AgentEvalBatch> {
    return this.http.request<AgentEvalBatch>("GET", `/agent-evals/batches/${batchId}`);
  }
}
