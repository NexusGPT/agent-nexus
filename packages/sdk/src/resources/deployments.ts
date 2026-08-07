import type {
  AttachWhatsAppTemplateBody,
  UpdateDeploymentTemplateBody,
  WhatsAppTemplateMessage
} from "../types/channels";
import type { PageResponse } from "../types/common";
import type {
  CreateDeploymentBody,
  DeleteDeploymentResponse,
  DeploymentDetail,
  DeploymentStats,
  DeploymentSummary,
  EmbedConfig,
  ListDeploymentsParams,
  UpdateDeploymentBody,
  UpdateEmbedConfigBody
} from "../types/deployments";
import { BaseResource } from "./base-resource";

/**
 * Deployment resource. Accessed via `client.deployments`.
 *
 * A deployment publishes one agent to one channel. The WhatsApp template
 * methods at the bottom apply only to `type: "WHATSAPP"` deployments.
 */
export class DeploymentsResource extends BaseResource {
  /**
   * List deployments with optional filtering and pagination.
   *
   * @param params - Optional filters and pagination.
   * @returns Paginated list of deployment summaries.
   */
  async list(params?: ListDeploymentsParams): Promise<PageResponse<DeploymentSummary>> {
    return this.http.requestPage<DeploymentSummary>("GET", "/deployments", {
      query: params as Record<string, string | number | boolean | undefined>
    });
  }

  /**
   * Create a deployment.
   *
   * @param body - Deployment properties. `name` and `type` are required.
   * @returns The created deployment.
   */
  async create(body: CreateDeploymentBody): Promise<DeploymentDetail> {
    return this.http.request<DeploymentDetail>("POST", "/deployments", { body });
  }

  /**
   * Get one deployment, including its channel settings.
   *
   * @param deploymentId - Deployment UUID.
   * @returns The deployment.
   */
  async get(deploymentId: string): Promise<DeploymentDetail> {
    return this.http.request<DeploymentDetail>("GET", `/deployments/${deploymentId}`);
  }

  /**
   * Update a deployment.
   *
   * @param deploymentId - Deployment UUID.
   * @param body - Fields to update.
   * @returns The updated deployment.
   */
  async update(deploymentId: string, body: UpdateDeploymentBody): Promise<DeploymentDetail> {
    return this.http.request<DeploymentDetail>("PATCH", `/deployments/${deploymentId}`, { body });
  }

  /**
   * Delete a deployment.
   *
   * @param deploymentId - Deployment UUID.
   * @returns The deleted deployment's id. This endpoint sends no `deleted` flag,
   *   so it is deliberately not the shared `DeleteResponse`.
   */
  async delete(deploymentId: string): Promise<DeleteDeploymentResponse> {
    return this.http.request<DeleteDeploymentResponse>("DELETE", `/deployments/${deploymentId}`);
  }

  /**
   * Duplicate a deployment.
   *
   * @deprecated The Public API v1 serves NO `POST /deployments/:id/duplicate`
   *   route — `V1DeploymentsController` declares no such handler and the v1
   *   contract carries no descriptor for it. Every call rejects with a 404,
   *   which is why the return type is `never`: this method cannot resolve.
   *   Agents and workflows do have a working `duplicate()`; deployments do not.
   *
   * @param deploymentId - Deployment UUID.
   * @throws {NexusApiError} Always — the route does not exist.
   */
  async duplicate(deploymentId: string): Promise<never> {
    return this.http.request<never>("POST", `/deployments/${deploymentId}/duplicate`);
  }

  /**
   * Session and message counts for a deployment.
   *
   * @param deploymentId - Deployment UUID.
   * @returns Totals plus the sessions they were computed from. The server reads
   *   at most 500 sessions, so the totals describe that window, not all time.
   */
  async getStatistics(deploymentId: string): Promise<DeploymentStats> {
    return this.http.request<DeploymentStats>("GET", `/deployments/${deploymentId}/statistics`);
  }

  /**
   * Get the embedded-widget configuration for a deployment.
   *
   * @param deploymentId - Deployment UUID.
   * @returns The widget config. Unset fields are `null`, never absent.
   */
  async getEmbedConfig(deploymentId: string): Promise<EmbedConfig> {
    return this.http.request<EmbedConfig>("GET", `/deployments/${deploymentId}/embed-config`);
  }

  /**
   * Update the embedded-widget configuration.
   *
   * @param deploymentId - Deployment UUID.
   * @param body - Fields to change.
   * @returns The whole merged config, not just the patch.
   */
  async updateEmbedConfig(deploymentId: string, body: UpdateEmbedConfigBody): Promise<EmbedConfig> {
    return this.http.request<EmbedConfig>("PATCH", `/deployments/${deploymentId}/embed-config`, {
      body
    });
  }

  // ===========================================================================
  // WhatsApp Deployment Templates
  // ===========================================================================

  async listDeploymentTemplates(deploymentId: string): Promise<WhatsAppTemplateMessage[]> {
    return this.http.request<WhatsAppTemplateMessage[]>(
      "GET",
      `/deployments/${deploymentId}/whatsapp-templates`
    );
  }

  async attachDeploymentTemplate(
    deploymentId: string,
    body: AttachWhatsAppTemplateBody
  ): Promise<WhatsAppTemplateMessage> {
    return this.http.request<WhatsAppTemplateMessage>(
      "POST",
      `/deployments/${deploymentId}/whatsapp-templates`,
      { body }
    );
  }

  async updateDeploymentTemplate(
    deploymentId: string,
    templateId: string,
    body: UpdateDeploymentTemplateBody
  ): Promise<WhatsAppTemplateMessage> {
    return this.http.request<WhatsAppTemplateMessage>(
      "PATCH",
      `/deployments/${deploymentId}/whatsapp-templates/${templateId}`,
      { body }
    );
  }

  async detachDeploymentTemplate(
    deploymentId: string,
    templateId: string
  ): Promise<{ detached: boolean }> {
    return this.http.request<{ detached: boolean }>(
      "DELETE",
      `/deployments/${deploymentId}/whatsapp-templates/${templateId}`
    );
  }

  async updateDeploymentTemplateSettings(
    deploymentId: string,
    body: { allowAgentToCreateAndSendTemplates?: boolean }
  ): Promise<{ updated: boolean }> {
    return this.http.request<{ updated: boolean }>(
      "PATCH",
      `/deployments/${deploymentId}/whatsapp-templates/settings`,
      { body }
    );
  }
}
