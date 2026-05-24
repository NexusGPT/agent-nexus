import type {
  CreateCustomModelBody,
  CustomModelSummary,
  UpdateCustomModelBody
} from "../types/custom-models";
import { BaseResource } from "./base-resource";

/**
 * Custom Models resource. Accessed via `client.customModels`.
 *
 * Manage organization-specific AI models with OpenAI-compatible endpoints.
 */
export class CustomModelsResource extends BaseResource {
  /**
   * List all custom models for the organization.
   */
  async list(): Promise<CustomModelSummary[]> {
    return this.http.request<CustomModelSummary[]>("GET", "/custom-models");
  }

  /**
   * Get a custom model by ID.
   */
  async get(customModelId: string): Promise<CustomModelSummary> {
    return this.http.request<CustomModelSummary>("GET", `/custom-models/${customModelId}`);
  }

  /**
   * Create a new custom model.
   */
  async create(body: CreateCustomModelBody): Promise<CustomModelSummary> {
    return this.http.request<CustomModelSummary>("POST", "/custom-models", { body });
  }

  /**
   * Update a custom model.
   */
  async update(customModelId: string, body: UpdateCustomModelBody): Promise<CustomModelSummary> {
    return this.http.request<CustomModelSummary>("PATCH", `/custom-models/${customModelId}`, {
      body
    });
  }

  /**
   * Delete a custom model.
   */
  async delete(customModelId: string): Promise<{ id: string }> {
    return this.http.request<{ id: string }>("DELETE", `/custom-models/${customModelId}`);
  }
}
