import type { RoleAccessRequestStatus, RoleResourceType } from "./role-core";

// ============================================================================
// Grants into the Role
// ============================================================================

/**
 * A knowledge collection reaching a Role.
 *
 * One of the two exceptions to a Role's exclusive ownership: a collection can be
 * shared across several Roles, so this is a grant row and not a system.
 */
export interface RoleCollectionGrant {
  /** Grant row UUID. */
  id: string;
  /** The Role reached. */
  roleId: string;
  /** The caller's own organization. */
  organizationId: string;
  /** The collection reaching it. */
  collectionId: string;
  /** ISO 8601. */
  createdAt: string;
}

/** Response from `client.roles.listCollectionGrants()`. */
export interface RoleCollectionGrantsResponse {
  /** Every knowledge collection this Role reaches. */
  grants: RoleCollectionGrant[];
}

/** A file workspace reaching a Role — the same many-to-many exception. */
export interface RoleWorkspaceGrant {
  /** Grant row UUID. */
  id: string;
  /** The Role reached. */
  roleId: string;
  /** The caller's own organization. */
  organizationId: string;
  /** The workspace reaching it. */
  workspaceId: string;
  /** ISO 8601. */
  createdAt: string;
}

/** Response from `client.roles.listWorkspaceGrants()`. */
export interface RoleWorkspaceGrantsResponse {
  /** Every file workspace this Role reaches. */
  grants: RoleWorkspaceGrant[];
}

// ============================================================================
// Access requests
// ============================================================================

/** A member's request for access to one of the Role's systems. */
export interface RoleAccessRequest {
  /** Request UUID. */
  id: string;
  /** The Role the system belongs to. */
  roleId: string;
  /** The caller's own organization. */
  organizationId: string;
  /** Who asked. Clerk user id. */
  requestedByUserId: string;
  /** Which kind of system. */
  resourceType: RoleResourceType;
  /** Which system. */
  resourceId: string;
  /** Where the request stands. */
  status: RoleAccessRequestStatus;
  /** What the requester wrote, or `null`. */
  note: string | null;
  /** Who decided, or `null` while `PENDING`. */
  reviewedByUserId: string | null;
  /** ISO 8601, or `null` while `PENDING`. */
  reviewedAt: string | null;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
}

/** Response from `client.roles.listAccessRequests()`. */
export interface RoleAccessRequestsResponse {
  /** The matching requests. */
  requests: RoleAccessRequest[];
}

/**
 * Filter for `client.roles.listAccessRequests()`.
 *
 * ⚠️ THIS TABLE ACCUMULATES. A reviewed request is kept with its verdict and
 * never deleted, so the unfiltered read grows for the lifetime of the Role and
 * there is no pagination on this route. A caller polling for work asks for
 * `PENDING`, which is bounded by how fast the organization reviews.
 */
export interface ListRoleAccessRequestsParams {
  /** Return only requests in this state. Omit for every state. */
  status?: RoleAccessRequestStatus;
}
