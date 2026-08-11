import type { HttpClient } from "../http-client";
import { appendFilePart } from "../multipart";
import type {
  AgentDetail,
  AgentSummary,
  CreateAgentBody,
  ListAgentsParams,
  UpdateAgentBody,
  UploadProfilePictureResponse
} from "../types/agents";
import type { DeleteResponse, PageResponse } from "../types/common";
import { AgentSkillsResource } from "./agent-skills";
import { AgentToolsResource } from "./agent-tools";
import { BaseResource } from "./base-resource";
import { VersionsResource } from "./versions";

/**
 * Agent management resource. Accessed via `client.agents`.
 *
 * Provides CRUD operations for agents plus sub-resources for
 * tool configurations (`client.agents.tools`), prompt versions
 * (`client.agents.versions`), and the Claude Code skills attached to a
 * code-interpreter agent (`client.agents.skills`).
 */
export class AgentsResource extends BaseResource {
  /** Sub-resource for managing agent tool configurations. */
  public readonly tools: AgentToolsResource;

  /** Sub-resource for managing agent prompt versions. */
  public readonly versions: VersionsResource;

  /** Sub-resource for the Claude Code skills attached to a code-interpreter agent. */
  public readonly skills: AgentSkillsResource;

  constructor(http: HttpClient) {
    super(http);
    this.tools = new AgentToolsResource(http);
    this.versions = new VersionsResource(http);
    this.skills = new AgentSkillsResource(http);
  }

  /**
   * List agents with optional filtering and pagination.
   *
   * @param params - Optional filters and pagination.
   * @returns Paginated list of agent summaries.
   */
  async list(params?: ListAgentsParams): Promise<PageResponse<AgentSummary>> {
    return this.http.requestPage<AgentSummary>("GET", "/agents", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get detailed information about a specific agent.
   *
   * @param agentId - Agent UUID.
   * @returns Full agent detail including prompt, behaviour rules, and model configuration.
   */
  async get(agentId: string): Promise<AgentDetail> {
    return this.http.request<AgentDetail>("GET", `/agents/${agentId}`);
  }

  /**
   * Create a new agent.
   *
   * @param body - Agent properties. `firstName`, `lastName`, and `role` are required.
   * @returns The created agent detail.
   */
  async create(body: CreateAgentBody): Promise<AgentDetail> {
    return this.http.request<AgentDetail>("POST", "/agents", { body });
  }

  /**
   * Update an existing agent's properties. Only provided fields are updated.
   *
   * @param agentId - Agent UUID.
   * @param body - Fields to update.
   * @returns The updated agent detail.
   */
  async update(agentId: string, body: UpdateAgentBody): Promise<AgentDetail> {
    return this.http.request<AgentDetail>("PATCH", `/agents/${agentId}`, { body });
  }

  /**
   * Permanently delete an agent and all its tool configurations and versions.
   *
   * @param agentId - Agent UUID.
   * @returns Confirmation with the deleted agent's ID.
   */
  async delete(agentId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/agents/${agentId}`);
  }

  /**
   * Create a copy of an existing agent, including its configuration and tools.
   *
   * @param agentId - Agent UUID to duplicate.
   * @returns The newly created agent detail.
   */
  async duplicate(agentId: string): Promise<AgentDetail> {
    return this.http.request<AgentDetail>("POST", `/agents/${agentId}/duplicate`);
  }

  /**
   * Upload a profile picture for an agent.
   *
   * @param agentId - Agent UUID.
   * @param file - Image file as a Blob or File.
   * @param fileName - File name to send. A bare `Blob` carries none, and the
   *   multipart part is then named `blob`; a `File` supplies its own.
   * @returns URL to the uploaded profile picture.
   */
  async uploadProfilePicture(
    agentId: string,
    file: Blob | File,
    fileName?: string
  ): Promise<UploadProfilePictureResponse> {
    const formData = new FormData();
    appendFilePart(formData, "file", file, fileName);
    return this.http.request<UploadProfilePictureResponse>(
      "POST",
      `/agents/${agentId}/profile-picture`,
      { body: formData }
    );
  }

  /**
   * Generate an AI profile picture for an agent using its name and role.
   *
   * @param agentId - Agent UUID.
   * @param body - Optional custom prompt to guide image style.
   * @returns URLs of the generated profile picture in multiple sizes.
   */
  async generateProfilePicture(
    agentId: string,
    body?: { customPrompt?: string }
  ): Promise<{ profilePicture: string; sizes: Record<string, string> }> {
    return this.http.request("POST", `/agents/${agentId}/generate-profile-picture`, { body });
  }
}
