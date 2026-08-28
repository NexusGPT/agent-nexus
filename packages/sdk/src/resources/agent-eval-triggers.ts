import type {
  AgentEvalTrigger,
  ListAgentEvalTriggersParams,
  UpsertAgentEvalTriggerBody
} from "../types/agent-evals";
import type { DeleteResponse } from "../types/common";
import { BaseResource } from "./base-resource";

/**
 * Triggers. Accessed via `client.agentEvals.triggers`.
 *
 * A trigger starts an evaluation run with nobody asking — `AUTO_ON_CLOSE` fires
 * as conversations close, `SCHEDULED_SAMPLE` on a sampled cadence. This is the
 * one surface in the domain that spends money in response to your USERS' traffic
 * rather than your own calls, which is why `enabled` defaults to `false` and
 * `sampleRate` exists.
 *
 * 🔴 {@link upsert} is a PUT and it is an upsert on `(agentId, deploymentId,
 * kind)`, not on an id: calling it twice for the same triple REPLACES the config
 * rather than creating a second trigger. There is deliberately no `create` and
 * no `update` — the contract declares one write verb and this resource does not
 * invent two names for it.
 *
 * ⚠️ {@link list} is NOT paginated. The contract declares no `page` or `limit`
 * on this route, so it returns a bare array and every trigger comes back at once.
 * That is the route's shape, not an omission here.
 */
export class AgentEvalTriggersResource extends BaseResource {
  /**
   * Create or replace the trigger for one `(agent, deployment, kind)` triple.
   *
   * ⚠️ Send a real `ModelProvider` in `judgeConfigs[].provider` and
   * `summaryConfig.provider` even though the type admits any string. This body
   * is the contract's one tolerant write door: a non-member is stored verbatim,
   * re-read on every fire, and routed to a vendor you did not choose rather than
   * erroring.
   *
   * @param body - The trigger. `kind` is required; `enabled` defaults to `false`.
   * @returns The stored trigger.
   */
  async upsert(body: UpsertAgentEvalTriggerBody): Promise<AgentEvalTrigger> {
    return this.http.request<AgentEvalTrigger>("PUT", "/agent-evals/triggers", { body });
  }

  /**
   * List triggers. Returns every match — this route does not paginate.
   *
   * @param params - Optional filters.
   * @returns Every trigger the filters select.
   */
  async list(params?: ListAgentEvalTriggersParams): Promise<AgentEvalTrigger[]> {
    return this.http.request<AgentEvalTrigger[]>("GET", "/agent-evals/triggers", {
      query: params as Record<string, string | boolean | undefined>
    });
  }

  /**
   * Permanently delete a trigger. Runs it already started survive.
   *
   * @param triggerId - Trigger UUID.
   * @returns Confirmation carrying the deleted trigger's id.
   */
  async delete(triggerId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/agent-evals/triggers/${triggerId}`);
  }
}
