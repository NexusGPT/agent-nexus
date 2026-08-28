import type { AgentEvalWebhook, UpsertAgentEvalWebhookBody } from "../types/agent-evals";
import type { DeleteResponse } from "../types/common";
import { BaseResource } from "./base-resource";

/**
 * Completion webhooks. Accessed via `client.agentEvals.webhooks`.
 *
 * Where the platform POSTs a signed payload when a run or batch finishes. A run,
 * schedule or trigger names one by `webhookConfigId`.
 *
 * 🔴 {@link upsert} is a PUT with no id in the path — the organization has ONE
 * webhook config per url, and writing replaces it. There is no `create`/`update`
 * pair because the contract declares one write verb.
 *
 * ⚠️ The API refuses a `url` pointing into a private network — loopback, private
 * and link-local ranges, and internal hostnames — because the backend dials it
 * server-side. Obfuscated IPv4 forms are normalized before that check, so a
 * decimal or hex spelling of a private address is refused too.
 *
 * ⚠️ There is no `list`. The contract declares `GET /agent-evals/webhooks/:id`
 * and nothing that enumerates them, so a webhook is reachable only by an id you
 * already hold — keep the one {@link upsert} returns.
 */
export class AgentEvalWebhooksResource extends BaseResource {
  /**
   * Create or replace the webhook config for a url.
   *
   * @param body - A public http(s) `url` and at least one event to subscribe to.
   * @returns The stored config. `secret` comes back REDACTED, so capture the
   *   value you sent — this is not a place to read it back from.
   */
  async upsert(body: UpsertAgentEvalWebhookBody): Promise<AgentEvalWebhook> {
    return this.http.request<AgentEvalWebhook>("PUT", "/agent-evals/webhooks", { body });
  }

  /**
   * Get one webhook config.
   *
   * @param webhookId - Webhook-config UUID.
   * @returns The config, with `secret` redacted.
   */
  async get(webhookId: string): Promise<AgentEvalWebhook> {
    return this.http.request<AgentEvalWebhook>("GET", `/agent-evals/webhooks/${webhookId}`);
  }

  /**
   * Permanently delete a webhook config.
   *
   * ⚠️ Anything still naming it by `webhookConfigId` simply stops being notified.
   *
   * @param webhookId - Webhook-config UUID.
   * @returns Confirmation carrying the deleted config's id.
   */
  async delete(webhookId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/agent-evals/webhooks/${webhookId}`);
  }
}
