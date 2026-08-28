import type {
  AgentEvalRun,
  AgentEvalRunAcknowledgement,
  AgentEvalRunResults,
  AgentEvalScoreDiff,
  AgentEvalTranscriptTurn,
  CreateAgentEvalRunBody,
  ListAgentEvalRunsParams
} from "../types/agent-evals";
import type { DeleteResponse, PageResponse } from "../types/common";
import { BaseResource } from "./base-resource";

/**
 * Evaluation runs. Accessed via `client.agentEvals.runs`.
 *
 * A run is created in `DRAFT`, started with {@link execute}, and moves through
 * its pipeline asynchronously — {@link get} is how you watch it, and
 * {@link results} is what to read once `status` reaches `COMPLETED`.
 *
 * ⚠️ {@link create} does NOT start anything. The two are separate calls on
 * purpose: a run's configuration is frozen at create, so it can be inspected
 * before any model spend happens.
 */
export class AgentEvalRunsResource extends BaseResource {
  /**
   * Create an evaluation run. Does not start it — call {@link execute} for that.
   *
   * @param body - Target, judges, and limits. Every config may either name a
   *   `templateId` for the server to resolve, or carry its text inline.
   * @returns The created run, with every config frozen as resolved text.
   */
  async create(body: CreateAgentEvalRunBody): Promise<AgentEvalRun> {
    return this.http.request<AgentEvalRun>("POST", "/agent-evals/runs", { body });
  }

  /**
   * List evaluation runs, newest first.
   *
   * @param params - Optional filters and pagination.
   * @returns One page of runs.
   */
  async list(params?: ListAgentEvalRunsParams): Promise<PageResponse<AgentEvalRun>> {
    return this.http.requestPage<AgentEvalRun>("GET", "/agent-evals/runs", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get one evaluation run, including its live `status`.
   *
   * @param runId - Run UUID.
   * @returns The run.
   */
  async get(runId: string): Promise<AgentEvalRun> {
    return this.http.request<AgentEvalRun>("GET", `/agent-evals/runs/${runId}`);
  }

  /**
   * Permanently delete a run and everything scored under it.
   *
   * @param runId - Run UUID.
   * @returns Confirmation carrying the deleted run's id.
   */
  async delete(runId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/agent-evals/runs/${runId}`);
  }

  /**
   * Enqueue a run. This is what starts spending money.
   *
   * Returns as soon as the job is queued — the run itself is asynchronous, so
   * poll {@link get} for `status`.
   *
   * @param runId - Run UUID.
   * @returns The run id and the status the enqueue wrote (`"QUEUED"`).
   */
  async execute(runId: string): Promise<AgentEvalRunAcknowledgement> {
    return this.http.request<AgentEvalRunAcknowledgement>(
      "POST",
      `/agent-evals/runs/${runId}/execute`
    );
  }

  /**
   * Stop a run that is in flight.
   *
   * @param runId - Run UUID.
   * @returns The run id and the status the abort wrote (`"ABORTED"`).
   */
  async abort(runId: string): Promise<AgentEvalRunAcknowledgement> {
    return this.http.request<AgentEvalRunAcknowledgement>(
      "POST",
      `/agent-evals/runs/${runId}/abort`
    );
  }

  /**
   * Read the conversation a run evaluated, in turn order.
   *
   * @param runId - Run UUID.
   * @returns Every turn, ordered by `turnIndex`.
   */
  async transcript(runId: string): Promise<AgentEvalTranscriptTurn[]> {
    return this.http.request<AgentEvalTranscriptTurn[]>(
      "GET",
      `/agent-evals/runs/${runId}/transcript`
    );
  }

  /**
   * Read a finished run's scores — every judge repetition, the per-criterion
   * aggregates, and the stored comparison against its baseline.
   *
   * @param runId - Run UUID.
   * @returns The run alongside its judge results, rollups and baseline diffs.
   */
  async results(runId: string): Promise<AgentEvalRunResults> {
    return this.http.request<AgentEvalRunResults>("GET", `/agent-evals/runs/${runId}/results`);
  }

  /**
   * Compare a run against any other run, per criterion.
   *
   * Computed on demand against the run you name here — unrelated to the STORED
   * `baselineDiffs` on {@link results}, which are frozen against the run's own
   * `baselineRunId`.
   *
   * @param runId - The run to score.
   * @param baselineRunId - The run to score it against. Required.
   * @returns One delta per criterion.
   */
  async compare(runId: string, baselineRunId: string): Promise<AgentEvalScoreDiff[]> {
    return this.http.request<AgentEvalScoreDiff[]>("GET", `/agent-evals/runs/${runId}/compare`, {
      query: { baselineRunId }
    });
  }
}
