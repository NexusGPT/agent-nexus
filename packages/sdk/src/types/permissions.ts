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
  | "workspace"
  | "track";

/**
 * A resource kind the generic permissions routes can actually name — every
 * {@link PermissionResourceType} except the two managed by Role grants.
 *
 * `knowledge` (a Collection) and `workspace` never carry a permission row at
 * all: they are narrowed through a Role's collection and workspace grants, and
 * every route on `client.permissions` refuses them with a 400 naming
 * `/roles/:roleId/collection-grants` or `/roles/:roleId/workspace-grants`. The
 * refusal is deliberate, so this type is what stops the request shapes offering
 * a value the server will never accept.
 *
 * READ them off `client.roles`; the wide {@link PermissionResourceType} still
 * types every RESPONSE, because a grant row written before the refusal existed
 * can still name one.
 */
export type GenericGrantResourceType = Exclude<PermissionResourceType, "knowledge" | "workspace">;

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

/**
 * Who reaches a resource beyond the grants its access list names.
 *
 * - `"organization"` — no grant names the resource and its type is open, so
 *   every member of the organization reaches it.
 * - `"type_wide_grant"` — a grant on this resource TYPE's wildcard reaches it.
 *   Those rows name no resource, so they are not in `permissions`.
 * - `"nobody"` — only the listed grants reach it.
 */
export type UnlistedReach = "organization" | "type_wide_grant" | "nobody";

/** Response from `client.permissions.listResourceAccess()`. */
export interface ListResourceAccessResponse {
  /** Every grant currently written against the resource. */
  permissions: PermissionGrant[];
  /**
   * 🚨 Read this BEFORE concluding anything from an empty `permissions` array.
   * A grant row names a resource; open visibility and a type-wide wildcard both
   * reach a resource without naming it, and both leave `permissions` empty. An
   * empty list means "nobody" only when this reads `"nobody"`.
   */
  unlistedReach: UnlistedReach;
}

// ============================================================================
// Grant / revoke
// ============================================================================

/** Request body for `client.permissions.grant()`. */
export interface GrantPermissionBody {
  /** The kind of resource to share. `knowledge` and `workspace` are refused — see {@link GenericGrantResourceType}. */
  resourceType: GenericGrantResourceType;
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
  /** The kind of resource to un-share. `knowledge` and `workspace` are refused — see {@link GenericGrantResourceType}. */
  resourceType: GenericGrantResourceType;
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
  /**
   * The resource type whose override to set or clear.
   *
   * WIDER THAN THE ROUTE, and deliberately left that way for now: the schema
   * behind it accepts only the non-pinned types at RUNTIME, but its tuple is
   * cast back to the full union, so this type cannot be narrowed without
   * narrowing that cast — and `types-match-the-v1-contract.test.ts` gates the
   * two as exactly equal. `vibe_app` and `access_card` are refused with a 400.
   */
  resourceType: PermissionResourceType;
  /** The override to store, or `null` to remove it. */
  visibility: ResourceVisibility | null;
}

/** Response from `client.permissions.updateResourceTypeVisibility()` — the settings AFTER the write. */
export type UpdateResourceTypeVisibilityResponse = OrgPermissionSettings;
