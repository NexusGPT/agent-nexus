import type { HttpClient } from "../http-client";
import type { MeResponse } from "../types/me";
import { BaseResource } from "./base-resource";

/**
 * Me resource. Accessed via `client.me`.
 *
 * Returns information about the authenticated organization
 * associated with the current API key.
 */
export class MeResource extends BaseResource {
  constructor(http: HttpClient) {
    super(http);
  }

  /**
   * Get organization info for the current API key.
   *
   * @returns Organization ID and name.
   */
  async get(): Promise<MeResponse> {
    return this.http.request<MeResponse>("GET", "/me");
  }
}
