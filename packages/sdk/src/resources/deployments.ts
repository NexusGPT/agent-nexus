import type {
  AttachWhatsAppTemplateBody,
  UpdateDeploymentTemplateBody,
  WhatsAppTemplateMessage
} from "../types/channels";
import type { PageResponse } from "../types/common";
import { BaseResource } from "./base-resource";

export class DeploymentsResource extends BaseResource {
  async list(params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    isActive?: boolean;
  }): Promise<PageResponse<any>> {
    const { data, meta } = await this.http.requestWithMeta<any[]>("GET", "/deployments", {
      query: params as Record<string, string | number | undefined>
    });
    return { data, meta: meta! };
  }

  async create(body: {
    name: string;
    type: string;
    agentId?: string;
    description?: string;
    settings?: Record<string, unknown>;
  }): Promise<any> {
    return this.http.request<any>("POST", "/deployments", { body });
  }

  async get(deploymentId: string): Promise<any> {
    return this.http.request<any>("GET", `/deployments/${deploymentId}`);
  }

  async update(
    deploymentId: string,
    body: {
      name?: string;
      description?: string | null;
      agentId?: string | null;
      settings?: Record<string, unknown>;
      isActive?: boolean;
    }
  ): Promise<any> {
    return this.http.request<any>("PATCH", `/deployments/${deploymentId}`, { body });
  }

  async delete(deploymentId: string): Promise<any> {
    return this.http.request<any>("DELETE", `/deployments/${deploymentId}`);
  }

  async duplicate(deploymentId: string): Promise<any> {
    return this.http.request<any>("POST", `/deployments/${deploymentId}/duplicate`);
  }

  async getStatistics(deploymentId: string): Promise<any> {
    return this.http.request<any>("GET", `/deployments/${deploymentId}/statistics`);
  }

  async getEmbedConfig(deploymentId: string): Promise<any> {
    return this.http.request<any>("GET", `/deployments/${deploymentId}/embed-config`);
  }

  async updateEmbedConfig(deploymentId: string, body: Record<string, unknown>): Promise<any> {
    return this.http.request<any>("PATCH", `/deployments/${deploymentId}/embed-config`, { body });
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
