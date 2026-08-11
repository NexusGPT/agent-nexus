import type {
  AttachRoleSystemBody,
  AttachRoleSystemResult,
  CreateRoleAccessRequestBody,
  CreateRoleBody,
  CreateRolePermissionSetBody,
  CreateRoleResult,
  DeleteRoleResult,
  DetachRoleSystemResult,
  GrantCollectionToRoleBody,
  GrantWorkspaceToRoleBody,
  ListRoleAccessRequestsParams,
  ListRoleManagementRequestsParams,
  ReviewRoleAccessRequestBody,
  ReviewRoleManagementRequestBody,
  RoleAccessRequestResponse,
  RoleAccessRequestsResponse,
  RoleAutomationSettings,
  RoleAutomationSettingsBody,
  RoleCollectionGrantResponse,
  RoleCollectionGrantsResponse,
  RoleCoverage,
  RoleCreationRequestResponse,
  RoleCreationRequestsResponse,
  RoleDeletionRequestResponse,
  RoleDeletionRequestsResponse,
  RoleJobTypeBody,
  RoleJobTypeDeleteResponse,
  RoleJobTypeLibrary,
  RoleJobTypeWriteResponse,
  RoleManagementSettingsResponse,
  RoleMember,
  RoleMembershipResponse,
  RolePermissionSetResponse,
  RolePermissionSetsResponse,
  RoleRemovalResult,
  RoleResourceType,
  RoleResponse,
  RoleScopeLinesBody,
  RoleScopeLinesResponse,
  RolesListResponse,
  RoleSystemPolicy,
  RoleSystemPolicyBody,
  RoleSystemsResponse,
  RoleUpdatedResponse,
  RoleVariablesBody,
  RoleVariablesResponse,
  RoleWorkingYear,
  RoleWorkingYearBody,
  RoleWorkspaceGrantResponse,
  RoleWorkspaceGrantsResponse,
  UpdateRoleBody,
  UpdateRolePermissionSetBody,
  UpsertRoleMemberBody
} from "../types/roles";
import { BaseResource } from "./base-resource";

/**
 * Roles — the organization's unit of containment. Accessed via `client.roles`.
 *
 * A Role owns its systems (agents, workflows, deployments, tasks, templates,
 * tools) EXCLUSIVELY, it has members and permission sets, it carries grants into
 * knowledge collections and file workspaces, and it reports how much of its work
 * is automated. All of that used to be reachable only from a browser session, so
 * an integration could create an agent and never find out which Role held it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TWO FACTS BEFORE ANY WRITE ON THIS RESOURCE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Neither is reversible by repeating the call, and neither reports itself:
 *
 * 1. **{@link RolesResource.attachSystem} MOVES a system, it does not add one.**
 *    A unique constraint gives each system exactly one owning Role, so an attach
 *    revokes the previous Role's claim and the permission grant its members held.
 *    `movedFromRoleId` in the response is the only signal that happened.
 * 2. **A system in no Role reaches nothing at runtime, and reports no error.**
 *    So {@link RolesResource.detachSystem} is a quiet disabling, and
 *    {@link RolesResource.delete} orphans every system the Role held. An empty
 *    `listSystems()` is a live functional problem rather than a tidy state.
 *
 * And a third for the two governed writes: **`create` and `delete` answer a UNION
 * on `status`, and a 2xx does not mean the write happened.** Governance can turn
 * either into a request awaiting an admin. Read the discriminant.
 *
 * ── A SCOPE IS NECESSARY AND NOT ALWAYS SUFFICIENT ───────────────────────────
 *
 * Every route is scope-guarded, and each Role-scoped one ALSO evaluates that
 * Role's own capability against the API key's OWNER — never against the key. So
 * a key holding `role_coverage:read` still receives a 403 when its owner does
 * not hold `coverage.view` on that Role, and a Role in another organization is a
 * 404 rather than a 403 (indistinguishable from one that never existed, on
 * purpose).
 *
 * ── THE WHOLE SURFACE IS DARK FOR AN ORGANIZATION ON LEGACY MODE ─────────────
 *
 * Roles are the platform default and the only switch is an opt-out. An
 * organization that opted out gets `403 FEATURE_NOT_ENABLED` on every method
 * here, not an empty list.
 */
export class RolesResource extends BaseResource {
  /**
   * Every Role in the organization.
   *
   * Unpaginated by design: a Role is a unit of organizational structure, bounded
   * by how a company is arranged rather than by usage, so the page cannot grow
   * with traffic. That is what makes this read cheap enough to use for resolving
   * a Role NAME to an id client-side.
   *
   * Carries no members and no systems — those are separate reads under separate
   * scopes, so an integration that lists Roles is not also handed the inventory
   * each one owns.
   *
   * @returns Every Role, each a bare row.
   */
  async list(): Promise<RolesListResponse> {
    return this.http.request<RolesListResponse>("GET", "/roles");
  }

  /**
   * One Role, WITHOUT its systems.
   *
   * @param roleId - Role UUID.
   * @returns The Role row, wrapped in `{ role }`.
   */
  async get(roleId: string): Promise<RoleResponse> {
    return this.http.request<RoleResponse>("GET", `/roles/${roleId}`);
  }

  /**
   * Every system the Role holds — agents, workflows, deployments, tasks,
   * templates and tools, as `(resourceType, resourceId)` pairs.
   *
   * Separately scoped from {@link RolesResource.get} (`role_resources:read`, and
   * the `resource.view` capability) precisely so "which Roles exist" and "what
   * does this Role own" are separately grantable.
   *
   * @param roleId - Role UUID.
   * @returns The pairs. Each system belongs to exactly one Role.
   */
  async listSystems(roleId: string): Promise<RoleSystemsResponse> {
    return this.http.request<RoleSystemsResponse>("GET", `/roles/${roleId}/resources`);
  }

  /**
   * The Role's owner, its admins and its plain members.
   *
   * The owner is a FIELD and not a row — ownership lives on the Role itself — so
   * do not look for them in `admins`.
   *
   * @param roleId - Role UUID.
   * @returns The owner's user id, plus the admin and member rows.
   */
  async listMembers(roleId: string): Promise<RoleMembershipResponse> {
    return this.http.request<RoleMembershipResponse>("GET", `/roles/${roleId}/members`);
  }

  /**
   * The Role's PERMISSION SETS — each named capability set living inside it.
   *
   * ⚠️ NOT the "Group access" tab. That is a different table describing an
   * organization user group reaching one surface of the Role, and it is not on
   * this surface at all.
   *
   * @param roleId - Role UUID.
   * @returns Each permission set, with its capabilities, resource relation and surfaces.
   */
  async listPermissionSets(roleId: string): Promise<RolePermissionSetsResponse> {
    return this.http.request<RolePermissionSetsResponse>("GET", `/roles/${roleId}/permission-sets`);
  }

  /**
   * Every knowledge collection this Role reaches.
   *
   * A grant rather than a system: a collection can be shared across several
   * Roles, which is one of the two exceptions to exclusive ownership.
   *
   * @param roleId - Role UUID.
   * @returns The grant rows.
   */
  async listCollectionGrants(roleId: string): Promise<RoleCollectionGrantsResponse> {
    return this.http.request<RoleCollectionGrantsResponse>(
      "GET",
      `/roles/${roleId}/collection-grants`
    );
  }

  /**
   * Every file workspace this Role reaches. The same many-to-many exception.
   *
   * @param roleId - Role UUID.
   * @returns The grant rows.
   */
  async listWorkspaceGrants(roleId: string): Promise<RoleWorkspaceGrantsResponse> {
    return this.http.request<RoleWorkspaceGrantsResponse>(
      "GET",
      `/roles/${roleId}/workspace-grants`
    );
  }

  /**
   * Requests for access to one of the Role's systems.
   *
   * ⚠️ THIS TABLE ACCUMULATES and this route has no pagination — a reviewed
   * request is kept with its verdict rather than deleted, so the unfiltered read
   * grows for the lifetime of the Role. Poll with `{ status: "PENDING" }`, which
   * is bounded by how fast the organization reviews.
   *
   * Seeing the queue and deciding an item are separate capabilities, and this
   * slice ships only the seeing.
   *
   * @param roleId - Role UUID.
   * @param params - Optional status filter.
   * @returns The matching requests.
   */
  async listAccessRequests(
    roleId: string,
    params: ListRoleAccessRequestsParams = {}
  ): Promise<RoleAccessRequestsResponse> {
    return this.http.request<RoleAccessRequestsResponse>(
      "GET",
      `/roles/${roleId}/access-requests`,
      { query: { status: params.status } }
    );
  }

  /**
   * One Role's automation coverage — person-hours automated over person-hours
   * worked, with every figure behind it.
   *
   * 🚨 THE RESPONSE CARRIES LABOUR COST. `money.totals.workloadCost` is the
   * Role's annual salary-and-seat cost and `savingsProjection.ratePerHour` is a
   * blended pay rate. The server evaluates the Role's own `coverage.view`
   * capability against the API key's OWNER, so `role_coverage:read` gets a caller
   * to the route and the Role decides whether it answers.
   *
   * 🚨 READ THE DISCRIMINANTS. `coverage.kind === "not-modelled"` is not 0% and
   * not 100%, and an empty `contributions` beside a populated `unmodelledSystems`
   * means nobody has modelled anything — never "measured at zero".
   *
   * @param roleId - Role UUID.
   * @returns The coverage view, its assumptions, its integrity and its money figures.
   */
  async getCoverage(roleId: string): Promise<RoleCoverage> {
    return this.http.request<RoleCoverage>("GET", `/roles/${roleId}/coverage`);
  }

  /**
   * The organization's job-type library — every way of paying for work it has
   * defined.
   *
   * ORG-WIDE and not Role-scoped, which is why the path is a sibling of `/roles`
   * rather than a child of one. This read is how a caller learns the job-type
   * ids: a scope line's foreign key is composite on `(jobTypeId,
   * organizationId)`, so naming an absent one fails at the database rather than
   * in validation.
   *
   * @returns The readable job types, plus the ids of rows whose rate inputs did not parse.
   */
  async listJobTypes(): Promise<RoleJobTypeLibrary> {
    return this.http.request<RoleJobTypeLibrary>("GET", "/role-job-types");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Writes
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create a Role — OR file a request to create one.
   *
   * 🚨 READ `result.status`, NEVER THE HTTP CODE. `"pending"` means the
   * organization's governance policy requires approval, nothing was created, and
   * an admin must act. A client that treats a 201 as success reports a Role that
   * does not exist.
   *
   * @param body - Name, optional job description, and the REQUIRED owner.
   * @returns Either the created Role or the filed request.
   */
  async create(body: CreateRoleBody): Promise<CreateRoleResult> {
    return this.http.request<CreateRoleResult>("POST", "/roles", { body });
  }

  /**
   * Rename a Role, rewrite its job description, or hand it to a new owner.
   *
   * ⚠️ A HANDOVER REMOVES THE OUTGOING OWNER FROM THE ROLE ENTIRELY, and nothing
   * in the response says so. `undefined` leaves ownership alone; `null` clears it.
   *
   * A transfer is gated separately against the current owner: refused, it is a 403
   * and NOTHING ELSE IN THE BODY IS APPLIED.
   *
   * @param roleId - Role UUID.
   * @param body - At least one field. An empty body is a 400.
   * @returns The Role after the write. Ask `get()` if you also need readiness.
   */
  async update(roleId: string, body: UpdateRoleBody): Promise<RoleUpdatedResponse> {
    return this.http.request<RoleUpdatedResponse>("PATCH", `/roles/${roleId}`, { body });
  }

  /**
   * Delete a Role — OR file a request to delete one.
   *
   * 🚨 `"pending"` MEANS THE ROLE IS STILL THERE.
   *
   * 🚨 AND A REAL DELETE ORPHANS EVERY SYSTEM THE ROLE HELD. They are not deleted
   * and not reassigned: they keep existing and keep running, reachable by nothing
   * that resolves access through a Role, silently. Call
   * {@link RolesResource.listSystems} first and move what matters.
   *
   * @param roleId - Role UUID.
   * @returns Either confirmation of the delete, or the filed request.
   */
  async delete(roleId: string): Promise<DeleteRoleResult> {
    return this.http.request<DeleteRoleResult>("DELETE", `/roles/${roleId}`);
  }

  /**
   * Put a system in this Role.
   *
   * 🚨 THIS IS A MOVE. A system belongs to exactly one Role, so this REVOKES the
   * previous Role's claim and the permission grant its members held. Check
   * `movedFromRoleId` in the result — a non-null value means another team just
   * lost that system, and it is the only signal you will get.
   *
   * @param roleId - Role UUID — the Role that will hold the system.
   * @param body - Which system. It must already exist in this organization.
   * @returns Whether it attached, and which Role it was taken from.
   */
  async attachSystem(roleId: string, body: AttachRoleSystemBody): Promise<AttachRoleSystemResult> {
    return this.http.request<AttachRoleSystemResult>("POST", `/roles/${roleId}/resources`, {
      body
    });
  }

  /**
   * Take a system out of whichever Role holds it.
   *
   * NAMES NO ROLE, and that is not an omission: exclusive ownership means there is
   * exactly one Role the system could be leaving, so the caller does not have to
   * know which. The server resolves it and reports it as `removedFromRoleId`.
   *
   * 🚨 THE SYSTEM SURVIVES AND KEEPS RUNNING — as an orphan, reachable by nothing
   * that resolves access through a Role, reporting no error. This is a disabling,
   * not a tidy-up.
   *
   * IDEMPOTENT: a system already in no Role answers 200 with `removed: false`.
   *
   * @param resourceType - Which kind of system.
   * @param resourceId - The system's UUID.
   * @returns Whether a row went, and which Role it left.
   */
  async detachSystem(
    resourceType: RoleResourceType,
    resourceId: string
  ): Promise<DetachRoleSystemResult> {
    return this.http.request<DetachRoleSystemResult>(
      "DELETE",
      `/role-resources/${resourceType}/${resourceId}`
    );
  }

  /**
   * Seat a user in this Role as `ADMIN` or `MEMBER`, or change the tier they hold.
   *
   * AN UPSERT on `(roleId, userId)`: a second call with a different `tier` MOVES
   * that person between the two rather than failing. Read `tier` off the result
   * instead of assuming this was an insert.
   *
   * 🚨 A MEMBERSHIP ROW IS NOT A LABEL. It is how the server resolves a person's
   * reach into the Role's systems, collections and workspaces, so this grants every
   * capability the tier's permission sets carry.
   *
   * ⚠️ THE USER MUST ALREADY BE IN YOUR ORGANIZATION. A user id from another
   * tenant answers 404 with the same body an id that exists nowhere gets — the
   * server will not tell you which, because that would confirm somebody else's user
   * exists.
   *
   * ⚠️ 409 IF THAT USER ALREADY OWNS THIS ROLE. Ownership is a field on the Role,
   * not a membership row, and the two standings are mutually exclusive — use
   * {@link RolesResource.update} to hand a Role over.
   *
   * @param roleId - Role UUID.
   * @param body - The user and the tier they should hold.
   * @returns The membership row that now stands.
   */
  async upsertMember(roleId: string, body: UpsertRoleMemberBody): Promise<RoleMember> {
    return this.http.request<RoleMember>("POST", `/roles/${roleId}/members`, { body });
  }

  /**
   * Remove a user's `ADMIN` or `MEMBER` standing in this Role.
   *
   * ⚠️ IT DOES NOT TOUCH OWNERSHIP. An owner holds no membership row, so asking
   * this to remove the OWNER is a no-op answering `removed: false`. Hand the Role
   * to somebody else with {@link RolesResource.update} instead.
   *
   * It DOES purge the user's permission-set rows — without that a removed member
   * keeps every capability of every set they belonged to while appearing on no
   * members list anywhere.
   *
   * @param roleId - Role UUID.
   * @param userId - Clerk user id.
   * @returns Whether a standing actually went.
   */
  async removeMember(roleId: string, userId: string): Promise<RoleRemovalResult> {
    return this.http.request<RoleRemovalResult>("DELETE", `/roles/${roleId}/members/${userId}`);
  }

  /**
   * Grant one knowledge collection to this Role. Idempotent — a re-grant returns
   * the existing row rather than a duplicate-key error.
   *
   * @param roleId - Role UUID.
   * @param body - The collection's UUID.
   * @returns The grant row.
   */
  async grantCollection(
    roleId: string,
    body: GrantCollectionToRoleBody
  ): Promise<RoleCollectionGrantResponse> {
    return this.http.request<RoleCollectionGrantResponse>(
      "POST",
      `/roles/${roleId}/collection-grants`,
      { body }
    );
  }

  /**
   * Revoke one knowledge-collection grant. Idempotent — `removed: false` for a
   * grant that was already gone, and that is a 200.
   *
   * @param roleId - Role UUID.
   * @param grantId - The GRANT row's UUID, not the collection's.
   * @returns Whether a row actually went.
   */
  async revokeCollection(roleId: string, grantId: string): Promise<RoleRemovalResult> {
    return this.http.request<RoleRemovalResult>(
      "DELETE",
      `/roles/${roleId}/collection-grants/${grantId}`
    );
  }

  /**
   * Grant one file workspace to this Role. Idempotent, same as the collection
   * grant.
   *
   * @param roleId - Role UUID.
   * @param body - The workspace's UUID.
   * @returns The grant row.
   */
  async grantWorkspace(
    roleId: string,
    body: GrantWorkspaceToRoleBody
  ): Promise<RoleWorkspaceGrantResponse> {
    return this.http.request<RoleWorkspaceGrantResponse>(
      "POST",
      `/roles/${roleId}/workspace-grants`,
      { body }
    );
  }

  /**
   * Revoke one file-workspace grant. Idempotent.
   *
   * @param roleId - Role UUID.
   * @param grantId - The GRANT row's UUID, not the workspace's.
   * @returns Whether a row actually went.
   */
  async revokeWorkspace(roleId: string, grantId: string): Promise<RoleRemovalResult> {
    return this.http.request<RoleRemovalResult>(
      "DELETE",
      `/roles/${roleId}/workspace-grants/${grantId}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Permission sets — create, update, delete
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create a permission set on this Role.
   *
   * 🚨 `surfaces` IS AN ALLOW-LIST, NOT A FILTER. A `resourceRelation` with
   * `surfaces: []` reaches NOTHING, and the server refuses that pair rather than
   * storing a set that grants nothing. Send `["*"]`, name the surfaces, or send
   * `resourceRelation: null` for a capability-only set.
   *
   * Read `resourceReach` on the response rather than re-deriving it from the two
   * fields.
   *
   * @param roleId - Role UUID.
   * @param body - Name, surfaces, and optionally the relation and capabilities.
   * @returns The set, plus what it actually reaches.
   */
  async createPermissionSet(
    roleId: string,
    body: CreateRolePermissionSetBody
  ): Promise<RolePermissionSetResponse> {
    return this.http.request<RolePermissionSetResponse>(
      "POST",
      `/roles/${roleId}/permission-sets`,
      { body }
    );
  }

  /**
   * Change a permission set.
   *
   * ⚠️ `capabilities` and `surfaces` REPLACE their lists rather than merging, so
   * sending a subset removes the rest. At least one field is required.
   *
   * A SYSTEM set's definition is immutable in the product — only its membership
   * can change — so this refuses one.
   *
   * @param roleId - Role UUID.
   * @param permissionSetId - Permission-set UUID.
   * @param body - The fields to change.
   * @returns The set after the write, plus what it reaches.
   */
  async updatePermissionSet(
    roleId: string,
    permissionSetId: string,
    body: UpdateRolePermissionSetBody
  ): Promise<RolePermissionSetResponse> {
    return this.http.request<RolePermissionSetResponse>(
      "PATCH",
      `/roles/${roleId}/permission-sets/${permissionSetId}`,
      { body }
    );
  }

  /**
   * Delete a permission set.
   *
   * A system set is refused — the seed always writes both templates and the
   * product will not let them go, which is why readiness can never report them
   * `ABSENT`.
   *
   * @param roleId - Role UUID.
   * @param permissionSetId - Permission-set UUID.
   * @returns Whether a row actually went.
   */
  async deletePermissionSet(roleId: string, permissionSetId: string): Promise<RoleRemovalResult> {
    return this.http.request<RoleRemovalResult>(
      "DELETE",
      `/roles/${roleId}/permission-sets/${permissionSetId}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Access requests — ask, and decide
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Ask for access to one of the Role's systems.
   *
   * @param roleId - Role UUID.
   * @param body - Which system, and why.
   * @returns The filed request, `PENDING`.
   */
  async createAccessRequest(
    roleId: string,
    body: CreateRoleAccessRequestBody
  ): Promise<RoleAccessRequestResponse> {
    return this.http.request<RoleAccessRequestResponse>(
      "POST",
      `/roles/${roleId}/access-requests`,
      { body }
    );
  }

  /**
   * Approve or reject an access request.
   *
   * Deciding is a SEPARATE permission from seeing the queue, so a caller that can
   * list requests may still be refused here.
   *
   * @param roleId - Role UUID.
   * @param requestId - Request UUID.
   * @param body - `APPROVED` or `REJECTED`. `PENDING` is never a target.
   * @returns The request carrying its verdict.
   */
  async reviewAccessRequest(
    roleId: string,
    requestId: string,
    body: ReviewRoleAccessRequestBody
  ): Promise<RoleAccessRequestResponse> {
    return this.http.request<RoleAccessRequestResponse>(
      "PATCH",
      `/roles/${roleId}/access-requests/${requestId}`,
      { body }
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Governance — the queues a pending create or delete lands in
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * The organization's Role-management governance settings.
   *
   * ⚠️ ORG-ADMIN ONLY. A non-admin key gets a 403, so it cannot learn in advance
   * whether `create()` will create or file. The drivable path for a non-admin
   * caller is the other direction: call `create()`, read `status`, and if it is
   * `"pending"` follow the request with {@link RolesResource.getCreationRequest}.
   *
   * @returns One row per action, each with `requiresApproval`.
   */
  async getManagementSettings(): Promise<RoleManagementSettingsResponse> {
    return this.http.request<RoleManagementSettingsResponse>("GET", "/role-management-settings");
  }

  /**
   * Filed requests to CREATE a Role. Each one means a Role that does not exist.
   *
   * This is the poll route that makes a governed create drivable without admin
   * rights.
   *
   * @param params - Optional status filter.
   * @returns The matching requests.
   */
  async listCreationRequests(
    params: ListRoleManagementRequestsParams = {}
  ): Promise<RoleCreationRequestsResponse> {
    return this.http.request<RoleCreationRequestsResponse>("GET", "/role-creation-requests", {
      query: { status: params.status }
    });
  }

  /**
   * One filed creation request.
   *
   * `createdRoleId` is `null` until it is approved, and non-null afterwards — so
   * this is how a caller learns the id of the Role its own request produced.
   *
   * @param requestId - Request UUID.
   * @returns The request.
   */
  async getCreationRequest(requestId: string): Promise<RoleCreationRequestResponse> {
    return this.http.request<RoleCreationRequestResponse>(
      "GET",
      `/role-creation-requests/${requestId}`
    );
  }

  /**
   * Approve or reject a filed creation request.
   *
   * 🚨 APPROVING IS WHAT CREATES THE ROLE. This is the write, not bookkeeping on a
   * write that already happened.
   *
   * @param requestId - Request UUID.
   * @param body - `APPROVED` or `REJECTED`.
   * @returns The request carrying its verdict and, once approved, `createdRoleId`.
   */
  async reviewCreationRequest(
    requestId: string,
    body: ReviewRoleManagementRequestBody
  ): Promise<RoleCreationRequestResponse> {
    return this.http.request<RoleCreationRequestResponse>(
      "PATCH",
      `/role-creation-requests/${requestId}`,
      { body }
    );
  }

  /**
   * Filed requests to DELETE a Role. Each names a Role that is still there.
   *
   * @param params - Optional status filter.
   * @returns The matching requests.
   */
  async listDeletionRequests(
    params: ListRoleManagementRequestsParams = {}
  ): Promise<RoleDeletionRequestsResponse> {
    return this.http.request<RoleDeletionRequestsResponse>("GET", "/role-deletion-requests", {
      query: { status: params.status }
    });
  }

  /**
   * One filed deletion request.
   *
   * @param requestId - Request UUID.
   * @returns The request.
   */
  async getDeletionRequest(requestId: string): Promise<RoleDeletionRequestResponse> {
    return this.http.request<RoleDeletionRequestResponse>(
      "GET",
      `/role-deletion-requests/${requestId}`
    );
  }

  /**
   * Approve or reject a filed deletion request.
   *
   * 🚨 APPROVING IS WHAT DELETES THE ROLE, and it orphans every system the Role
   * held — they keep existing and keep running, reachable by nothing that resolves
   * access through a Role. Read the Role's systems first.
   *
   * @param requestId - Request UUID.
   * @param body - `APPROVED` or `REJECTED`.
   * @returns The request carrying its verdict.
   */
  async reviewDeletionRequest(
    requestId: string,
    body: ReviewRoleManagementRequestBody
  ): Promise<RoleDeletionRequestResponse> {
    return this.http.request<RoleDeletionRequestResponse>(
      "PATCH",
      `/role-deletion-requests/${requestId}`,
      { body }
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // The job model
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Add a job type to the organization's library.
   *
   * 🚨 EVERY FIELD IS REQUIRED, and the nullable ones must be sent as `null`
   * rather than omitted. `null` is not `0`: `fte: null` is a full contract, a
   * `null` expression means "use the basis' built-in one", and an empty-string
   * expression evaluates to zero. Substituting `0` for an absent number changes
   * what a Role costs.
   *
   * 🚨 `basis: "CUSTOM"` with `costExpression: null` is REFUSED, because CUSTOM
   * has no built-in cost expression and a null one would price every scope line
   * quantifying this type at ZERO with no error on any read.
   *
   * @param body - The whole job type.
   * @returns The job type, and how many scope lines this repriced.
   */
  async createJobType(body: RoleJobTypeBody): Promise<RoleJobTypeWriteResponse> {
    return this.http.request<RoleJobTypeWriteResponse>("POST", "/role-job-types", { body });
  }

  /**
   * Replace a job type. A PUT of the WHOLE object — read it, change it, send it
   * all back. An omitted field is a validation error, not "leave it alone".
   *
   * ⚠️ A job type is SHARED. `repricedScopeLines` on the response is how many
   * scope lines across every Role this write just repriced — that is the blast
   * radius, and it is reported rather than left to be discovered.
   *
   * @param jobTypeId - Job-type UUID.
   * @param body - The whole job type.
   * @returns The job type, and the reprice count.
   */
  async updateJobType(jobTypeId: string, body: RoleJobTypeBody): Promise<RoleJobTypeWriteResponse> {
    return this.http.request<RoleJobTypeWriteResponse>("PUT", `/role-job-types/${jobTypeId}`, {
      body
    });
  }

  /**
   * Remove a job type from the library.
   *
   * @param jobTypeId - Job-type UUID.
   * @returns The id that was removed.
   */
  async deleteJobType(jobTypeId: string): Promise<RoleJobTypeDeleteResponse> {
    return this.http.request<RoleJobTypeDeleteResponse>("DELETE", `/role-job-types/${jobTypeId}`);
  }

  /**
   * The organization's working-time assumptions and its currency.
   *
   * Every coverage figure in the organization rests on these three numbers, and
   * `currency: null` is why a coverage read can answer `money: not-modelled`.
   *
   * 🚨 RETURNS `null` WHEN THE ORGANIZATION HAS NEVER STATED THEM, which is the
   * common path on a new organization. That is not an error and not an empty
   * object: it is how a client knows to present ITS OWN defaults as defaults
   * rather than reporting somebody's authored choice. Check for `null` before
   * reading a field.
   *
   * @returns The settings, or `null` when none are stated.
   */
  async getAutomationSettings(): Promise<RoleAutomationSettings | null> {
    return this.http.request<RoleAutomationSettings | null>("GET", "/role-automation-settings");
  }

  /**
   * Replace the organization's automation settings.
   *
   * All three numbers are required, finite and `> 0` — there is no `null` for
   * them, because a zero-length day makes every coverage figure unusable.
   * `currency` IS required-and-nullable.
   *
   * @param body - The whole settings object.
   * @returns The settings after the write.
   */
  async upsertAutomationSettings(
    body: RoleAutomationSettingsBody
  ): Promise<RoleAutomationSettings> {
    return this.http.request<RoleAutomationSettings>("PUT", "/role-automation-settings", { body });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // The Role's authored workload
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * The Role's scope lines — its authored workload.
   *
   * 🚨 READ `unresolvedVariables`. A non-empty array means these lines' job types
   * reference variables the Role does not define, so the lines are priced from an
   * incomplete model.
   *
   * @param roleId - Role UUID.
   * @returns The lines, and any unresolved variable keys.
   */
  async listScopeLines(roleId: string): Promise<RoleScopeLinesResponse> {
    return this.http.request<RoleScopeLinesResponse>("GET", `/roles/${roleId}/scope-lines`);
  }

  /**
   * Replace the Role's scope lines.
   *
   * 🚨 THIS REPLACES THE WHOLE LIST — a line's identity is its index, so anything
   * absent from `lines` is DELETED. Read, modify, send back. `lines: []` empties
   * the workload and makes the Role's coverage `not-modelled`.
   *
   * A `quantity` of `0` is legal and is NOT a delete: it records a decision.
   *
   * @param roleId - Role UUID.
   * @param body - Every line the Role should have afterwards.
   * @returns The lines as stored, and any unresolved variable keys.
   */
  async replaceScopeLines(
    roleId: string,
    body: RoleScopeLinesBody
  ): Promise<RoleScopeLinesResponse> {
    return this.http.request<RoleScopeLinesResponse>("PUT", `/roles/${roleId}/scope-lines`, {
      body
    });
  }

  /**
   * The Role's variables — the values its job types' parts reference.
   *
   * @param roleId - Role UUID.
   * @returns The variables, in order.
   */
  async listVariables(roleId: string): Promise<RoleVariablesResponse> {
    return this.http.request<RoleVariablesResponse>("GET", `/roles/${roleId}/variables`);
  }

  /**
   * Replace the Role's variables.
   *
   * 🚨 REPLACES THE WHOLE LIST, like the scope lines. Keys must be unique.
   *
   * ⚠️ `value: null` means UNSET, so every part referencing that key is
   * unresolved and its line priced from an incomplete model. It is NOT zero —
   * sending `0` asserts a measured zero.
   *
   * @param roleId - Role UUID.
   * @param body - Every variable the Role should have afterwards.
   * @returns The variables as stored.
   */
  async replaceVariables(roleId: string, body: RoleVariablesBody): Promise<RoleVariablesResponse> {
    return this.http.request<RoleVariablesResponse>("PUT", `/roles/${roleId}/variables`, { body });
  }

  /**
   * The Role's working-year override.
   *
   * 🚨 THE WHOLE RESPONSE IS `null` WHEN THE ROLE HAS STATED NO OVERRIDE AT ALL,
   * which is distinct from an override whose individual fields are `null`. Two
   * levels of absence: no row (this `null`) versus a row that defers a field to
   * the organization (a `null` field). Check the response before reading a field.
   *
   * @param roleId - Role UUID.
   * @returns The override, or `null` when the Role has stated none. Any `null` FIELD means the organization's value applies.
   */
  async getWorkingYear(roleId: string): Promise<RoleWorkingYear | null> {
    return this.http.request<RoleWorkingYear | null>("GET", `/roles/${roleId}/working-year`);
  }

  /**
   * Replace the Role's working-year override.
   *
   * 🚨 EVERY FIELD IS REQUIRED AND NULLABLE, and `null` is not `0`. `null` means
   * "no override, use the organization's value"; `0` asserts a measured zero —
   * zero paid leave, zero public holidays. They produce different coverage
   * denominators, and neither is an error, so nothing will tell you which you
   * meant.
   *
   * @param roleId - Role UUID.
   * @param body - The whole override.
   * @returns The override after the write.
   */
  async upsertWorkingYear(roleId: string, body: RoleWorkingYearBody): Promise<RoleWorkingYear> {
    return this.http.request<RoleWorkingYear>("PUT", `/roles/${roleId}/working-year`, { body });
  }

  /**
   * The Role's system policy — the defaults its systems start under.
   *
   * 🚨 RETURNS `null` WHEN THE ROLE HAS NO POLICY ROW, which is the state a Role
   * is created in. Check for `null` before reading a flag — reading one off
   * `null` throws, and defaulting the five flags to `false` would report a
   * policy nobody chose.
   *
   * @param roleId - Role UUID.
   * @returns The policy, or `null` when the Role has none.
   */
  async getSystemPolicy(roleId: string): Promise<RoleSystemPolicy | null> {
    return this.http.request<RoleSystemPolicy | null>("GET", `/roles/${roleId}/system-policy`);
  }

  /**
   * Replace the Role's system policy. A PUT of all five flags, never a patch.
   *
   * @param roleId - Role UUID.
   * @param body - All five flags.
   * @returns The policy after the write.
   */
  async upsertSystemPolicy(roleId: string, body: RoleSystemPolicyBody): Promise<RoleSystemPolicy> {
    return this.http.request<RoleSystemPolicy>("PUT", `/roles/${roleId}/system-policy`, { body });
  }
}
