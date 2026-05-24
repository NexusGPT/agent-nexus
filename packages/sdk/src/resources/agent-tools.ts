import type {
  AgentToolConfig,
  AttachCollectionBody,
  CreateAgentToolBody,
  UpdateAgentToolBody
} from "../types/agent-tools";
import type { DeleteResponse } from "../types/common";
import { BaseResource } from "./base-resource";

/**
 * Agent tool configuration resource. Accessed via `client.agents.tools`.
 *
 * Manages the tools attached to an agent. Each tool config represents a
 * configured integration (e.g. "Gmail - Send Email" with saved credentials
 * and parameter defaults).
 *
 * To discover available marketplace tools before creating a config, use
 * `client.tools.search()` and `client.tools.get()`.
 */
export class AgentToolsResource extends BaseResource {
  /**
   * List all tool configurations for an agent.
   *
   * @param agentId - Agent UUID.
   * @returns Array of tool configurations.
   */
  async list(agentId: string): Promise<AgentToolConfig[]> {
    return this.http.request<AgentToolConfig[]>("GET", `/agents/${agentId}/tools`);
  }

  /**
   * Get a specific tool configuration.
   *
   * @param agentId - Agent UUID.
   * @param toolId - Tool config UUID.
   * @returns Tool configuration detail.
   */
  async get(agentId: string, toolId: string): Promise<AgentToolConfig> {
    return this.http.request<AgentToolConfig>("GET", `/agents/${agentId}/tools/${toolId}`);
  }

  /**
   * Add a new tool configuration to an agent.
   *
   * @param agentId - Agent UUID.
   * @param body - Tool configuration. `label` and `type` are required.
   * @returns The created tool configuration.
   */
  async create(agentId: string, body: CreateAgentToolBody): Promise<AgentToolConfig> {
    return this.http.request<AgentToolConfig>("POST", `/agents/${agentId}/tools`, { body });
  }

  /**
   * Update an existing tool configuration. Only provided fields are updated.
   *
   * @param agentId - Agent UUID.
   * @param toolId - Tool config UUID.
   * @param body - Fields to update.
   * @returns The updated tool configuration.
   */
  async update(
    agentId: string,
    toolId: string,
    body: UpdateAgentToolBody
  ): Promise<AgentToolConfig> {
    return this.http.request<AgentToolConfig>("PATCH", `/agents/${agentId}/tools/${toolId}`, {
      body
    });
  }

  /**
   * Remove a tool configuration from an agent.
   *
   * @param agentId - Agent UUID.
   * @param toolId - Tool config UUID.
   * @returns Confirmation with the deleted tool config's ID.
   */
  async delete(agentId: string, toolId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/agents/${agentId}/tools/${toolId}`);
  }

  /**
   * Attach a knowledge collection to an agent.
   *
   * Creates a COLLECTION-type tool that allows the agent to search the
   * collection during conversations. If `label` is omitted, the collection
   * name is used.
   *
   * @param agentId - Agent UUID.
   * @param body - Collection ID and optional label/description/instructions.
   * @returns The created tool configuration.
   *
   * @example
   * ```ts
   * const tool = await client.agents.tools.attachCollection("agent-uuid", {
   *   collectionId: "collection-uuid"
   * });
   * ```
   */
  async attachCollection(agentId: string, body: AttachCollectionBody): Promise<AgentToolConfig> {
    return this.http.request<AgentToolConfig>(
      "POST",
      `/agents/${agentId}/tools/attach-collection`,
      { body }
    );
  }
}
