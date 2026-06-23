// ============================================================================
// Me / Organization info (whoami endpoint)
// ============================================================================

/** Organization info returned by `client.me.get()`. */
export interface MeResponse {
  /**
   * Organization unique ID. `null` when a personal (cross-org) token calls
   * `/me` without selecting an organization (no `organization-id` header).
   */
  orgId: string | null;
  /** Human-readable organization name. `null` when no org is selected. */
  orgName: string | null;
}

/** One organization the calling token can act on, from `client.me.organizations()`. */
export interface UserOrganization {
  /** Organization unique ID — pass as the `organization-id` header / `organizationId` option. */
  organizationId: string;
  /** Human-readable organization name. */
  name: string | null;
  /** The calling user's role in this organization (e.g. `"org:admin"`). */
  role: string;
}
