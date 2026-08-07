import type { DeleteResponse, PageResponse } from "../types/common";
import type {
  CreateCheckpointBody,
  ListVersionsParams,
  RestoreVersionResponse,
  UpdateVersionBody,
  VersionDetail,
  VersionSummary
} from "../types/versions";
import { BaseResource } from "./base-resource";

/**
 * Agent prompt version resource. Accessed via `client.agents.versions`.
 *
 * Versions track changes to an agent's system prompt over time.
 * - `AUTO` versions are created automatically when the prompt changes.
 * - `CHECKPOINT` versions are manually named snapshots (e.g. "v1.0").
 *
 * Use `restore()` to revert an agent's prompt to a previous version,
 * and `publish()` to deploy a version to production.
 */
export class VersionsResource extends BaseResource {
  /**
   * List prompt versions for an agent (paginated).
   *
   * @param agentId - Agent UUID.
   * @param params - Optional type filter and pagination.
   * @returns Paginated list of version summaries.
   */
  async list(agentId: string, params?: ListVersionsParams): Promise<PageResponse<VersionSummary>> {
    return this.http.requestPage<VersionSummary>("GET", `/agents/${agentId}/versions`, {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get detailed information about a specific version, including the full prompt content.
   *
   * @param agentId - Agent UUID.
   * @param versionId - Version UUID.
   * @returns Version detail with the prompt text.
   */
  async get(agentId: string, versionId: string): Promise<VersionDetail> {
    return this.http.request<VersionDetail>("GET", `/agents/${agentId}/versions/${versionId}`);
  }

  /**
   * Create a named checkpoint of the agent's current prompt.
   *
   * @param agentId - Agent UUID.
   * @param body - Optional name and description for the checkpoint.
   * @returns The created checkpoint version.
   */
  async createCheckpoint(agentId: string, body?: CreateCheckpointBody): Promise<VersionDetail> {
    return this.http.request<VersionDetail>("POST", `/agents/${agentId}/versions`, {
      body: body ?? {}
    });
  }

  /**
   * Update a version's metadata (name or description).
   *
   * @param agentId - Agent UUID.
   * @param versionId - Version UUID.
   * @param body - Fields to update.
   * @returns The updated version detail.
   */
  async update(
    agentId: string,
    versionId: string,
    body: UpdateVersionBody
  ): Promise<VersionDetail> {
    return this.http.request<VersionDetail>("PATCH", `/agents/${agentId}/versions/${versionId}`, {
      body
    });
  }

  /**
   * Delete a prompt version. Cannot delete the current production version.
   *
   * @param agentId - Agent UUID.
   * @param versionId - Version UUID.
   * @returns Confirmation with the deleted version's ID.
   */
  async delete(agentId: string, versionId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/agents/${agentId}/versions/${versionId}`);
  }

  /**
   * Restore the agent's prompt to a specific version. This overwrites the
   * agent's current prompt with the content from the specified version.
   *
   * @param agentId - Agent UUID.
   * @param versionId - Version UUID to restore.
   * @returns The restored prompt content and a confirmation message.
   */
  async restore(agentId: string, versionId: string): Promise<RestoreVersionResponse> {
    return this.http.request<RestoreVersionResponse>(
      "POST",
      `/agents/${agentId}/versions/${versionId}/restore`
    );
  }

  /**
   * Publish a version to production. This marks the version as the active
   * production version for the agent.
   *
   * @param agentId - Agent UUID.
   * @param versionId - Version UUID to publish.
   * @returns The published version detail with `isProduction: true`.
   */
  async publish(agentId: string, versionId: string): Promise<VersionDetail> {
    return this.http.request<VersionDetail>(
      "POST",
      `/agents/${agentId}/versions/${versionId}/publish`
    );
  }
}
