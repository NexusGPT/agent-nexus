import { appendFilePart } from "../multipart";
import type {
  AgentSkill,
  AgentSkillDownloadUrl,
  CreateAgentSkillBody,
  DeleteAgentSkillResponse,
  ListAgentSkillsResponse,
  UpdateAgentSkillBody,
  UploadAgentSkillZipResponse
} from "../types/agent-skills";
import { BaseResource } from "./base-resource";

/**
 * The name sent for the bundle when the caller does not supply one.
 *
 * Neither v1 skill route reads the uploaded part's name — `s3Key` is derived
 * from the org, agent and skill ids — so this is a label rather than a
 * behaviour switch. It stays because a bundle arriving as undici's default
 * `"blob"` is confusing in a request log for a route that only ever carries a
 * ZIP.
 */
const DEFAULT_BUNDLE_FILE_NAME = "skill.zip";

/**
 * Claude Code skills attached to a code-interpreter agent. Accessed via
 * `client.agents.skills`.
 *
 * A skill is one ZIP whose root holds a `SKILL.md` plus its supporting files;
 * the platform unpacks every attached skill into the agent's sandbox at session
 * start. Writes require the agent's model to support the code interpreter —
 * anything else is rejected with a 400, because the bundle would never load.
 */
export class AgentSkillsResource extends BaseResource {
  /** List the skills attached to an agent, with per-skill file counts and sizes. */
  async list(agentId: string): Promise<ListAgentSkillsResponse> {
    return this.http.request<ListAgentSkillsResponse>(
      "GET",
      `/agents/${encodeURIComponent(agentId)}/skills`
    );
  }

  /**
   * Attach a skill to an agent.
   *
   * Pass `file` as a ZIP whose root — or whose single top-level folder — holds
   * `SKILL.md`. Omit it to scaffold a starter `SKILL.md` you fill in later with
   * {@link uploadZip}.
   *
   * @param fileName - Name to send the bundle under. Defaults to `skill.zip`;
   *   the route ignores it either way.
   */
  async create(
    agentId: string,
    body: CreateAgentSkillBody,
    file?: Blob | File,
    fileName?: string
  ): Promise<AgentSkill> {
    const formData = new FormData();
    formData.append("name", body.name);
    if (body.description !== undefined) formData.append("description", body.description);
    if (file) appendFilePart(formData, "file", file, fileName ?? DEFAULT_BUNDLE_FILE_NAME);
    return this.http.request<AgentSkill>("POST", `/agents/${encodeURIComponent(agentId)}/skills`, {
      body: formData
    });
  }

  /** Fetch one skill's metadata. */
  async get(agentId: string, skillId: string): Promise<AgentSkill> {
    return this.http.request<AgentSkill>(
      "GET",
      `/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`
    );
  }

  /** Rename a skill or change its description. */
  async update(agentId: string, skillId: string, body: UpdateAgentSkillBody): Promise<AgentSkill> {
    return this.http.request<AgentSkill>(
      "PATCH",
      `/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
      { body }
    );
  }

  /** Detach a skill from the agent and purge its stored bundle. */
  async delete(agentId: string, skillId: string): Promise<DeleteAgentSkillResponse> {
    return this.http.request<DeleteAgentSkillResponse>(
      "DELETE",
      `/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`
    );
  }

  /**
   * Replace an existing skill's files with a new ZIP.
   *
   * @param fileName - Name to send the bundle under. Defaults to `skill.zip`;
   *   the route ignores it either way.
   */
  async uploadZip(
    agentId: string,
    skillId: string,
    file: Blob | File,
    fileName?: string
  ): Promise<UploadAgentSkillZipResponse> {
    const formData = new FormData();
    appendFilePart(formData, "file", file, fileName ?? DEFAULT_BUNDLE_FILE_NAME);
    return this.http.request<UploadAgentSkillZipResponse>(
      "POST",
      `/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}/upload`,
      { body: formData }
    );
  }

  /** Mint a short-lived (15 min) presigned URL for the skill's ZIP. */
  async getDownloadUrl(agentId: string, skillId: string): Promise<AgentSkillDownloadUrl> {
    return this.http.request<AgentSkillDownloadUrl>(
      "GET",
      `/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}/download`
    );
  }
}
