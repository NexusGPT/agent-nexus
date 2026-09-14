import type {
  CreatePromptEvalRunBody,
  CreatePromptEvalRunResult,
  ListPromptEvalRunsParams,
  PreviewPromptEvalRunBody,
  PromptEvalCaseDetail,
  PromptEvalRun,
  PromptEvalRunPreview,
  PromptEvalRunResults
} from "../types/prompt-eval-runs";
import { BaseResource } from "./base-resource";

/**
 * PROMPT EVAL RUNS — the matrix. Accessed via `client.promptEvalRuns`.
 * Feature-flag gated (PROMPT_EVAL, whitelist): orgs without the flag get 403.
 *
 * ## The loop
 *
 * `preview` to see what the run would be → `create` to queue it → poll `get`
 * until `status` leaves QUEUED/RUNNING → `results` for the matrix → `getCase`
 * to open one cell. `abort` stops a run in flight.
 *
 * ## 🔴 `create` spends real money
 *
 * Every cell runs the agent live with real tool calls and then calls a judge,
 * four cells at a time. A fifteen-cell run takes minutes. Preview first, and
 * pass `budgetCapUsdTenThousandths` to bound the spend — the run aborts with
 * `abortReason: "BUDGET_CAP"` once it reaches the cap.
 */
export class PromptEvalRunsResource extends BaseResource {
  /** Queue a run. Returns immediately with the run QUEUED. */
  async create(body: CreatePromptEvalRunBody): Promise<CreatePromptEvalRunResult> {
    return this.http.request<CreatePromptEvalRunResult>("POST", "/prompt-eval/runs", { body });
  }

  /**
   * What the run WOULD be — case count, resolved candidates, warnings —
   * without creating or queueing anything. Costs nothing.
   */
  async preview(body: PreviewPromptEvalRunBody): Promise<PromptEvalRunPreview> {
    return this.http.request<PromptEvalRunPreview>("POST", "/prompt-eval/runs/preview", { body });
  }

  /** The org's runs, newest first. */
  async list(params?: ListPromptEvalRunsParams): Promise<PromptEvalRun[]> {
    return this.http.request<PromptEvalRun[]>("GET", "/prompt-eval/runs", {
      query: params?.agentId === undefined ? {} : { agentId: params.agentId }
    });
  }

  /** One run: status, cost, rollup. The rollup is null until it settles. */
  async get(runId: string): Promise<PromptEvalRun> {
    return this.http.request<PromptEvalRun>(
      "GET",
      `/prompt-eval/runs/${encodeURIComponent(runId)}`
    );
  }

  /**
   * Stop a QUEUED or RUNNING run. Cells in flight finish and are kept; cells
   * never started become SKIPPED. Nothing already computed is discarded.
   */
  async abort(runId: string): Promise<PromptEvalRun> {
    return this.http.request<PromptEvalRun>(
      "POST",
      `/prompt-eval/runs/${encodeURIComponent(runId)}/abort`
    );
  }

  /** The matrix: every cell with its judge verdicts, plus the rollup. */
  async results(runId: string): Promise<PromptEvalRunResults> {
    return this.http.request<PromptEvalRunResults>(
      "GET",
      `/prompt-eval/runs/${encodeURIComponent(runId)}/results`
    );
  }

  /** One cell: golden vs candidate, both with tool calls, plus the reasoning. */
  async getCase(runId: string, caseId: string): Promise<PromptEvalCaseDetail> {
    return this.http.request<PromptEvalCaseDetail>(
      "GET",
      `/prompt-eval/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}`
    );
  }
}
