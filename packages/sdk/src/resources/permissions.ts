import type {
  GenericGrantResourceType,
  GrantPermissionBody,
  GrantPermissionResponse,
  ListResourceAccessResponse,
  OrgPermissionSettings,
  RevokePermissionBody,
  RevokePermissionResponse,
  UpdateResourceTypeVisibilityBody,
  UpdateResourceTypeVisibilityResponse
} from "../types/permissions";
import { BaseResource } from "./base-resource";

/**
 * Permission grants and organization visibility settings. Accessed via
 * `client.permissions`.
 *
 * **An API key reaches exactly what a grant naming it allows.** Every route here
 * resolves the caller into an `api_key` SUBJECT that is not an org admin — never
 * into the key's owning user. A key that can create a private resource can
 * therefore still fail to read it back until a grant says otherwise.
 */
export class PermissionsResource extends BaseResource {
  /**
   * List every grant currently written against one resource.
   *
   * @param resourceType - The kind of resource. `knowledge` and `workspace` are
   *   refused by this route — read their access off `client.roles` instead, see
   *   {@link GenericGrantResourceType}.
   * @param resourceId - The resource's UUID.
   * @returns Every grant row, each naming its subject and relation.
   */
  async listResourceAccess(
    resourceType: GenericGrantResourceType,
    resourceId: string
  ): Promise<ListResourceAccessResponse> {
    return this.http.request<ListResourceAccessResponse>(
      "GET",
      `/permissions/${resourceType}/${resourceId}/access`
    );
  }

  /**
   * Grant a principal a relation on a resource.
   *
   * @param body - The resource, the subject, and the relation to grant.
   * @returns The new grant row's id and creation timestamp.
   */
  async grant(body: GrantPermissionBody): Promise<GrantPermissionResponse> {
    return this.http.request<GrantPermissionResponse>("POST", "/permissions/grant", { body });
  }

  /**
   * Revoke a principal's grant on a resource, optionally cascading to grants
   * delegated from it.
   *
   * @param body - The resource, the subject, and any downstream subject ids to cascade to.
   * @returns How many grant rows were removed.
   */
  async revoke(body: RevokePermissionBody): Promise<RevokePermissionResponse> {
    return this.http.request<RevokePermissionResponse>("POST", "/permissions/revoke", { body });
  }

  /**
   * Read the organization's resource visibility settings.
   *
   * Assert on `effectiveVisibilityByType` — the other two fields are what is
   * STORED, and a pinned type ignores its stored override.
   *
   * @returns The global default, the stored per-type overrides, and what each type resolves to.
   */
  async getOrgSettings(): Promise<OrgPermissionSettings> {
    return this.http.request<OrgPermissionSettings>("GET", "/permissions/org-settings");
  }

  /**
   * Set or clear the organization's visibility override for ONE resource type.
   *
   * @param body - The resource type, and the visibility to store or `null` to clear the override.
   * @returns The settings as they stand after the write.
   */
  async updateResourceTypeVisibility(
    body: UpdateResourceTypeVisibilityBody
  ): Promise<UpdateResourceTypeVisibilityResponse> {
    return this.http.request<UpdateResourceTypeVisibilityResponse>(
      "PATCH",
      "/permissions/org-settings/resource-type",
      { body }
    );
  }
}
