// ============================================================================
// Primitives
// ============================================================================

/**
 * A resource kind a permission grant can name.
 *
 * Mirrors the server's `ResourceType` enum. Every one of these is keyed on a
 * UUID column, which is why `resourceId` is uuid-checked everywhere except a
 * revoke (see {@link RevokePermissionBody}).
 */
export type PermissionResourceType =
  | "agent"
  | "workflow"
  | "knowledge"
  | "credential"
  | "access_card"
  | "template"
  | "document"
  | "deployment"
  | "feature"
  | "vibe_app"
  | "workspace";

/**
 * The principal a grant is written for.
 *
 * `user` and `group` name a profile the access list can render. `organization`,
 * `role` and `api_key` name no profile at all — read `subjectType` and
 * `subjectId` to identify a row, never the presence of {@link PermissionGrant.user}.
 */
export type PermissionSubjectType = "user" | "group" | "organization" | "api_key" | "role";

/** Relation hierarchy: `owner` > `editor` > `viewer`. You may only grant a relation at or below your own. */
export type PermissionRelation = "owner" | "editor" | "viewer";

/**
 * What happens to a resource carrying no grant rows at all.
 *
 * - `"open"` — every member of the organization reaches it.
 * - `"closed"` — only the creator and org admins do; everyone else needs a grant.
 */
export type ResourceVisibility = "open" | "closed";

// ============================================================================
// Access list
// ============================================================================

/** The user behind a `user`-subject grant row. */
export interface PermissionGranteeUser {
  /** Clerk user id (`user_…`). */
  id: string;
  /** Display name. */
  name: string;
}

/** The group behind a `group`-subject grant row. */
export interface PermissionGranteeGroup {
  /** `UserGroup` UUID. */
  id: string;
  /** Group display name. */
  name: string;
  /** How many users belong to the group. */
  memberCount: number;
}

/**
 * One row of a resource's access list.
 *
 * `user` and `group` are populated only for the matching `subjectType`; both are
 * `null` for `organization`, `role` and `api_key` rows.
 */
export interface PermissionGrant {
  /** Grant row UUID. */
  id: string;
  /** The kind of resource this grant is written against. */
  resourceType: PermissionResourceType;
  /** The resource's UUID. */
  resourceId: string;
  /** The kind of principal the grant names. */
  subjectType: PermissionSubjectType;
  /** The principal's id — a user id, group UUID, org id, role id, or API key id. */
  subjectId: string;
  /** The level of access granted. */
  relation: PermissionRelation;
  /** Who wrote the grant, or `null` when the system did. */
  grantedByUserId: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** The grantee's user profile, or `null` when `subjectType` is not `"user"`. */
  user: PermissionGranteeUser | null;
  /** The grantee's group profile, or `null` when `subjectType` is not `"group"`. */
  group: PermissionGranteeGroup | null;
}

/** Response from `client.permissions.listResourceAccess()`. */
export interface ListResourceAccessResponse {
  /** Every grant currently written against the resource. */
  permissions: PermissionGrant[];
}

// ============================================================================
// Grant / revoke
// ============================================================================

/** Request body for `client.permissions.grant()`. */
export interface GrantPermissionBody {
  /** The kind of resource to share. */
  resourceType: PermissionResourceType;
  /** The resource's UUID. A wildcard is not accepted here. */
  resourceId: string;
  /** The kind of principal to grant to. */
  subjectType: PermissionSubjectType;
  /** The principal's id. */
  subjectId: string;
  /** The level of access to grant. */
  relation: PermissionRelation;
}

/** Response from `client.permissions.grant()`. */
export interface GrantPermissionResponse {
  /** The new grant row's UUID. */
  id: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Request body for `client.permissions.revoke()`. */
export interface RevokePermissionBody {
  /** The kind of resource to un-share. */
  resourceType: PermissionResourceType;
  /** The resource's UUID, or `"*"` to target a wildcard grant. */
  resourceId: string;
  /** The kind of principal to revoke from. */
  subjectType: PermissionSubjectType;
  /** The principal's id. */
  subjectId: string;
  /**
   * Grants that were delegated FROM the one being revoked.
   *
   * The server intersects these with the real downstream set, so naming an
   * unrelated subject here removes nothing.
   */
  cascadeSubjectIds?: string[];
}

/** Response from `client.permissions.revoke()`. */
export interface RevokePermissionResponse {
  /** How many grant rows were removed, cascade included. */
  revokedCount: number;
}

// ============================================================================
// Org settings
// ============================================================================

/**
 * The organization's visibility settings, stored and resolved.
 *
 * **Assert on `effectiveVisibilityByType`.** `vibe_app` and `access_card` carry
 * a system pin that is read BEFORE the per-type override and before the global
 * default, so a stale override on either reads as the answer while changing
 * nothing. The other two fields explain a value; they do not decide one.
 */
export interface OrgPermissionSettings {
  /** The organization's global default, exactly as stored. */
  defaultResourceVisibility: ResourceVisibility;
  /** The per-type overrides, exactly as stored. A pinned type ignores its entry here. */
  resourceVisibilityByType: Partial<Record<PermissionResourceType, ResourceVisibility>>;
  /** What each type's visibility ACTUALLY is: system pin, else override, else default. */
  effectiveVisibilityByType: Record<PermissionResourceType, ResourceVisibility>;
}

/**
 * Request body for `client.permissions.updateResourceTypeVisibility()`.
 *
 * `visibility: null` REMOVES the override so the type falls back to the
 * organization's global default. It is not "leave unchanged" — omitting the
 * field entirely is refused with a 400.
 *
 * `vibe_app` and `access_card` are pinned CLOSED by the system and are refused
 * here with a 400 rather than stored as an override nothing honours.
 */
export interface UpdateResourceTypeVisibilityBody {
  /** The resource type whose override to set or clear. */
  resourceType: PermissionResourceType;
  /** The override to store, or `null` to remove it. */
  visibility: ResourceVisibility | null;
}

/** Response from `client.permissions.updateResourceTypeVisibility()` — the settings AFTER the write. */
export type UpdateResourceTypeVisibilityResponse = OrgPermissionSettings;
