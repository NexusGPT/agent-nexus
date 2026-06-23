import type { ApiKeyConnection, CreateApiKeyConnectionBody } from "../types/api-key-connections";
import { BaseResource } from "./base-resource";

export class ApiKeyConnectionsResource extends BaseResource {
  /**
   * Create an API key connection (e.g. a SLACK_BOT bot token).
   *
   * Credentials are validated against the service API before being stored
   * encrypted. The returned `id` can be passed as `apiKeyConnectionId` when
   * creating a deployment.
   */
  async create(body: CreateApiKeyConnectionBody): Promise<ApiKeyConnection> {
    return this.http.request<ApiKeyConnection>("POST", "/api-key-connections", { body });
  }
}
