import type { HttpClient } from "../http-client";
import type { ModelSummary } from "../types/models";
import { BaseResource } from "./base-resource";

/**
 * Models resource. Accessed via `client.models`.
 *
 * Provides read-only access to the available AI models that can be
 * used when creating or updating agents.
 */
export class ModelsResource extends BaseResource {
  constructor(http: HttpClient) {
    super(http);
  }

  /**
   * List all enabled AI models available for agents.
   *
   * @returns Array of model summaries with identifiers, providers, and capabilities.
   */
  async list(): Promise<{ models: ModelSummary[] }> {
    return this.http.request<{ models: ModelSummary[] }>("GET", "/models");
  }
}
