import type { HttpClient } from "../http-client";
import type { MeResponse, UserOrganization } from "../types/me";
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

  /**
   * List every organization the calling token can act on, with the user's role
   * in each. Use with a personal (cross-org) token to discover orgs, then pass a
   * chosen `organizationId` to the client (or per-request `organization-id`
   * header) to act on it. See NEX-2474.
   *
   * @returns The caller's organization memberships.
   */
  async organizations(): Promise<UserOrganization[]> {
    return this.http.request<UserOrganization[]>("GET", "/me/organizations");
  }
}
