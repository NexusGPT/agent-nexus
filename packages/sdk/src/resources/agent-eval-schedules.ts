import type {
  AgentEvalSchedule,
  CreateAgentEvalScheduleBody,
  ListAgentEvalSchedulesParams,
  UpdateAgentEvalScheduleBody
} from "../types/agent-evals";
import type { DeleteResponse, PageResponse } from "../types/common";
import { BaseResource } from "./base-resource";

/**
 * Schedules. Accessed via `client.agentEvals.schedules`.
 *
 * A schedule is a cron that materializes one evaluation run per tick, from a
 * FROZEN recipe (`runConfig`).
 *
 * ⚠️ Frozen means resolved: the tick processor bypasses template resolution, so
 * a `templateId` inside `runConfig` is never expanded and the resolved text has
 * to be there already. Same rule as a batch, and for the same reason — the
 * create call is the only moment anything checks these values.
 *
 * 🔴 A schedule spends on every tick, unattended. {@link pause} is the stop
 * button; {@link delete} is permanent. `runConfig.budgetCapUsdTenThousandths`
 * bounds one tick, not the schedule's lifetime — there is no lifetime cap.
 */
export class AgentEvalSchedulesResource extends BaseResource {
  /**
   * Create a schedule. It starts `ACTIVE` and its first tick fires on the cron.
   *
   * @param body - The cron, its timezone, and the frozen run recipe.
   * @returns The created schedule, carrying `nextRunAt`.
   */
  async create(body: CreateAgentEvalScheduleBody): Promise<AgentEvalSchedule> {
    return this.http.request<AgentEvalSchedule>("POST", "/agent-evals/schedules", { body });
  }

  /**
   * List schedules.
   *
   * @param params - Optional status filter and pagination.
   * @returns One page of schedules.
   */
  async list(params?: ListAgentEvalSchedulesParams): Promise<PageResponse<AgentEvalSchedule>> {
    return this.http.requestPage<AgentEvalSchedule>("GET", "/agent-evals/schedules", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Update a schedule. Only the fields you send are written.
   *
   * ⚠️ `runConfig` is replaced WHOLESALE, never merged — send the complete
   * recipe or the fields you leave out are gone from the next tick.
   *
   * @param scheduleId - Schedule UUID.
   * @param body - Fields to write.
   * @returns The updated schedule, with `nextRunAt` recomputed.
   */
  async update(scheduleId: string, body: UpdateAgentEvalScheduleBody): Promise<AgentEvalSchedule> {
    return this.http.request<AgentEvalSchedule>("PATCH", `/agent-evals/schedules/${scheduleId}`, {
      body
    });
  }

  /**
   * Permanently delete a schedule. Runs it already created survive.
   *
   * @param scheduleId - Schedule UUID.
   * @returns Confirmation carrying the deleted schedule's id.
   */
  async delete(scheduleId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/agent-evals/schedules/${scheduleId}`);
  }

  /**
   * Stop a schedule ticking, without deleting it. Reversible via {@link resume}.
   *
   * @param scheduleId - Schedule UUID.
   * @returns The schedule at `status: "PAUSED"`.
   */
  async pause(scheduleId: string): Promise<AgentEvalSchedule> {
    return this.http.request<AgentEvalSchedule>(
      "POST",
      `/agent-evals/schedules/${scheduleId}/pause`
    );
  }

  /**
   * Start a paused schedule ticking again.
   *
   * ⚠️ Resuming does NOT replay the ticks that were missed while paused. The
   * next tick is the next one the cron names from now.
   *
   * @param scheduleId - Schedule UUID.
   * @returns The schedule at `status: "ACTIVE"`, with `nextRunAt` recomputed.
   */
  async resume(scheduleId: string): Promise<AgentEvalSchedule> {
    return this.http.request<AgentEvalSchedule>(
      "POST",
      `/agent-evals/schedules/${scheduleId}/resume`
    );
  }
}
