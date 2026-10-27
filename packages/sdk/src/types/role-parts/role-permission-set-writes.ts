import type { PermissionRelation } from "../permissions";
import type {
  RoleAccessRequestStatus,
  RoleCapability,
  RoleDeletionRequestStatus,
  RolePermissionSet,
  RolePermissionSetSurface,
  RoleResourceType
} from "./role-core";
import type { RoleAccessRequest } from "./role-grants";
import type { RoleCreationRequest, RoleDeletionRequest } from "./role-writes";

// ============================================================================
// Permission-set writes
// ============================================================================

/**
 * WHAT A PERMISSION SET ACTUALLY REACHES, as a discriminant rather than as two
 * fields a reader has to combine.
 *
 * The server computes it because the combination is easy to get backwards:
 *
 * - `capability_only` — `resourceRelation` is `null`. Reaches no resources BY
 *   DESIGN, and that is a legitimate, chosen state.
 * - `no_surface` — a relation IS set and `surfaces` is empty, so it reaches
 *   NOTHING. Almost always a mistake, which is why the write refuses it.
 * - `every_surface` — `surfaces` is `["*"]`.
 * - `listed_surfaces` — the named surfaces only.
 */
export type RolePermissionSetResourceReach =
  | "capability_only"
  | "no_surface"
  | "every_surface"
  | "listed_surfaces";

/**
 * Request body for `client.roles.createPermissionSet()`.
 *
 * 🚨 `surfaces` IS A STRICT ALLOW-LIST, NOT A FILTER. Sending a
 * `resourceRelation` with `surfaces: []` reaches NOTHING, and the server REFUSES
 * that combination rather than storing a set that grants nothing. Send `["*"]`
 * for every surface, name the surfaces you mean, or send `resourceRelation: null`
 * for a capability-only set.
 */
export interface CreateRolePermissionSetBody {
  /** Display name, 1–120 characters. */
  name: string;
  /**
   * What the set confers on the Role's systems. Omitted defaults to `null` — a
   * capability-only set, deliberately the least-granting value.
   */
  resourceRelation?: PermissionRelation | null;
  /** What members may DO to the Role. Omitted defaults to `[]`. */
  capabilities?: RoleCapability[];
  /** The surfaces the relation is narrowed to. `["*"]` for all. */
  surfaces: RolePermissionSetSurface[];
}

/**
 * Request body for `client.roles.updatePermissionSet()`. At least one field is
 * required. The same empty-`surfaces` refusal applies.
 */
export interface UpdateRolePermissionSetBody {
  /** New display name. */
  name?: string;
  /** New relation, or `null` to make it capability-only. */
  resourceRelation?: PermissionRelation | null;
  /** REPLACES the capability list. */
  capabilities?: RoleCapability[];
  /** REPLACES the surface allow-list. */
  surfaces?: RolePermissionSetSurface[];
}

/** Response from the permission-set create and update. */
export interface RolePermissionSetResponse {
  /** The set after the write. */
  permissionSet: RolePermissionSet;
  /** What it actually reaches, computed by the server. Read this, not the two fields. */
  resourceReach: RolePermissionSetResourceReach;
}

/** Request body for `client.roles.addPermissionSetMember()`. */
export interface AddRolePermissionSetMemberBody {
  /** The Clerk user id to seat. Must already hold the Role, as owner or member. */
  userId: string;
}

/**
 * Response from `client.roles.addPermissionSetMember()`.
 *
 * `added: false` IS A SUCCESS — a second add of somebody already in the set
 * answers 200 with `false` rather than 409, because the caller asked for a state
 * that already holds.
 *
 * ⚠️ THE STATUS CODE IS NOT THE DISCRIMINANT. This route answers 200 whether or
 * not a row was written, as does `upsertMember()` when it merely moves a tier.
 * This boolean is where "did anything move" lives.
 */
export interface RolePermissionSetMemberAddedResult {
  /** Whether a row was actually written. */
  added: boolean;
}

// ============================================================================
// Access requests — asking, and deciding
// ============================================================================

/** Request body for `client.roles.createAccessRequest()`. */
export interface CreateRoleAccessRequestBody {
  /** Which kind of system access is wanted for. */
  resourceType: RoleResourceType;
  /** The system's UUID. */
  resourceId: string;
  /** Why, up to 2000 characters. */
  note?: string | null;
}

/**
 * Request body for `client.roles.reviewAccessRequest()`.
 *
 * `PENDING` is the starting state and never a target, so only the two verdicts
 * are accepted.
 */
export interface ReviewRoleAccessRequestBody {
  /** The verdict. */
  status: "APPROVED" | "REJECTED";
}

/** Response from the access-request create and review. */
export interface RoleAccessRequestResponse {
  /** The request after the write. */
  request: RoleAccessRequest;
}

// ============================================================================
// Governance — the approval queues, and the settings that decide them
// ============================================================================

/** Filter for the creation-request list. */
export interface ListRoleManagementRequestsParams {
  /** Return only requests in this state. Omit for every state. */
  status?: RoleAccessRequestStatus;
}

/** Filter for the deletion-request list. */
export interface ListRoleDeletionRequestsParams {
  /** Return only requests in this state. Omit for every state. */
  status?: RoleDeletionRequestStatus;
}

/** Response from `client.roles.listCreationRequests()`. */
export interface RoleCreationRequestsResponse {
  /** The matching requests. Each one means a Role that does NOT exist yet. */
  requests: RoleCreationRequest[];
}

/** Response from `client.roles.getCreationRequest()` and its review. */
export interface RoleCreationRequestResponse {
  /** The request. `createdRoleId` is non-null only after approval. */
  request: RoleCreationRequest;
}

/** Response from `client.roles.listDeletionRequests()`. */
export interface RoleDeletionRequestsResponse {
  /** The matching requests. A `PENDING` one names a Role that is STILL THERE. */
  requests: RoleDeletionRequest[];
}

/** Response from `client.roles.getDeletionRequest()` and its review. */
export interface RoleDeletionRequestResponse {
  /** The request. */
  request: RoleDeletionRequest;
}

/**
 * Request body for approving or rejecting a filed creation or deletion request.
 *
 * 🚨 APPROVING A CREATION REQUEST IS WHAT CREATES THE ROLE, and approving a
 * DELETION request is what deletes it. This is the write, not a bookkeeping
 * update on a write that already happened.
 */
export interface ReviewRoleManagementRequestBody {
  /** The verdict. */
  status: "APPROVED" | "REJECTED";
}

/** A Role-management action a governance policy can gate. */
export type RoleManagementAction =
  | "CREATE_ROLE"
  | "DELETE_ROLE"
  | "MANAGE_MEMBERS"
  | "MANAGE_GROUP_GRANTS"
  | "MANAGE_RESOURCES";

/**
 * One action's governance settings.
 *
 * Only the actions that HAVE an approval queue get a row — `CREATE_ROLE` and
 * `DELETE_ROLE`. The other three `RoleManagementAction` values name no live
 * decision on the server, so a row for them would report a setting nothing
 * consults.
 */
export interface RoleManagementActionSettings {
  /** Which action this row governs. Always `CREATE_ROLE` or `DELETE_ROLE`. */
  action: RoleManagementAction;
  /**
   * Whether performing it files a request instead of doing it.
   *
   * This is the field that tells a caller IN ADVANCE whether `create()` or
   * `delete()` will answer `status: "created"` / `"deleted"` or `"pending"`.
   */
  requiresApproval: boolean;
}

/**
 * Response from `client.roles.getManagementSettings()`.
 *
 * ⚠️ ORG-ADMIN ONLY. A non-admin key cannot read this, so it cannot learn the
 * branch in advance — it must instead read the `status` discriminant on the
 * write's own response, and follow the filed request through
 * `listCreationRequests()` / `getCreationRequest()`. That is the drivable path
 * for a non-admin caller, and it is the reason those routes exist.
 */
export interface RoleManagementSettingsResponse {
  /** One row per action. */
  settings: RoleManagementActionSettings[];
}
