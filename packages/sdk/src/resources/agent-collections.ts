import type {
  AgentCollection,
  AttachAgentCollectionsBody,
  AttachAgentCollectionsResponse
} from "../types/agent-collections";
import { BaseResource } from "./base-resource";

/**
 * Agent knowledge-collection resource. Accessed via `client.agentCollections`.
 *
 * Controls which collections an agent may query. The collections themselves are
 * created and filled through `client.skills`.
 */
export class AgentCollectionsResource extends BaseResource {
  /**
   * List the collections attached to an agent.
   *
   * @param agentId - Agent UUID.
   * @returns The attached collections. Not paginated — the whole list comes back.
   */
  async list(agentId: string): Promise<AgentCollection[]> {
    return this.http.request<AgentCollection[]>("GET", `/agents/${agentId}/collections`);
  }

  /**
   * Attach collections to an agent.
   *
   * @param agentId - Agent UUID.
   * @param body - Collection UUIDs to attach.
   * @returns The deduplicated ids and how many there were. Attaching an already
   *   attached collection succeeds and still counts.
   */
  async attach(
    agentId: string,
    body: AttachAgentCollectionsBody
  ): Promise<AttachAgentCollectionsResponse> {
    return this.http.request<AttachAgentCollectionsResponse>(
      "POST",
      `/agents/${agentId}/collections`,
      { body }
    );
  }

  /**
   * Detach collections from an agent. The collections themselves are not deleted.
   *
   * @param agentId - Agent UUID.
   * @param body - Collection UUIDs to detach.
   * @returns The deduplicated ids and how many there were.
   */
  async detach(
    agentId: string,
    body: AttachAgentCollectionsBody
  ): Promise<AttachAgentCollectionsResponse> {
    return this.http.request<AttachAgentCollectionsResponse>(
      "DELETE",
      `/agents/${agentId}/collections`,
      { body }
    );
  }
}
