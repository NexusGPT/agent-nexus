import type {
  Role,
  RoleAccessRequestStatus,
  RoleDeletionRequestStatus,
  RoleMemberTier,
  RoleResourceType,
  RoleResponse
} from "./role-core";
import type { RoleCollectionGrant, RoleWorkspaceGrant } from "./role-grants";

// ============================================================================
// The job-type library — org-wide, not Role-scoped
// ============================================================================

/** How a job type's arithmetic works. Fixes its default cost and hours expressions. */
export type RoleJobTypeBasis =
  | "SALARY"
  | "HOURLY"
  | "SEAT"
  | "DAY"
  | "UNIT"
  | "FIXED"
  | "CREDIT"
  | "CUSTOM";

/** Which Scope-tab heading a job type subtotals under. */
export type RoleJobTypeGroup = "PEOPLE" | "PARTNERS" | "PLATFORM" | "CREDITS";

/** Where a job type part's number comes from. */
export type RoleJobTypePartSource =
  | {
      kind: "variable";
      /** A shared assumption's key, resolved at evaluation time and never inlined. */
      variable: string;
    }
  | { kind: "fixed"; value: number };

/** One rate input of a job type. */
export interface RoleJobTypePart {
  /** The name the expressions reference this term by. */
  key: string;
  /** What the term is called in the type's drawer. */
  label: string;
  /** How the term reads — "€ a year", "%", "hours". DISPLAY ONLY. */
  unit: string;
  /** Where its number comes from. */
  source: RoleJobTypePartSource;
}

/** One row of the organization's job-type library — a way of paying for work. */
export interface RoleJobType {
  /** Job-type UUID. A scope line's `jobTypeId` is one of these. */
  id: string;
  /** What the arrangement is called: "Support agent, Manila". */
  name: string;
  /** How the arithmetic works. */
  basis: RoleJobTypeBasis;
  /** Which heading it subtotals under. */
  group: RoleJobTypeGroup;
  /** The listing band in the "Add a line" picker. Display, not arithmetic. */
  category: string;
  /** What ONE unit of this type is: "people", "seats", "h / wk". */
  quantityUnit: string;
  /** The author's own sentence, or `null`. */
  note: string | null;
  /**
   * The fraction of a full contract a SALARY line buys — `0.6` for 60%
   * part-time. It divides the hours and never the cost.
   *
   * `null` is a full contract, and deliberately not `1`: only `null` survives a
   * later change to what "full" means.
   */
  fte: number | null;
  /** The rate inputs. At least one — a type with none prices every line at zero. */
  parts: RoleJobTypePart[];
  /** Overrides the basis' cost-per-unit expression. `null` uses the basis'. */
  costExpression: string | null;
  /** Overrides the basis' hours-per-unit expression. `null` uses the basis'. */
  hoursExpression: string | null;
  /** Revenue one unit credits back a year. `null` when unmodelled. */
  revenueExpression: string | null;
  /** The library's own order. Assigned by the server. */
  position: number;
  /** ISO 8601. */
  updatedAt: string;
}

/**
 * Response from `client.roles.listJobTypes()`.
 *
 * 🚨 `unreadable` IS NOT DECORATION AND MUST NOT BE DROPPED. A row whose stored
 * rate inputs did not parse is WITHHELD from `jobTypes` and named here instead —
 * because reporting it with no rates would price every scope line using it at
 * ZERO with nothing saying so, and refusing the whole read would blank the
 * library over one bad row. A non-empty array is worth surfacing to a human.
 */
export interface RoleJobTypeLibrary {
  /** Every readable job type, in the library's own order. */
  jobTypes: RoleJobType[];
  /** Ids of rows whose stored rate inputs did not parse. Normally empty. */
  unreadable: string[];
}

// ============================================================================
// Writes — and every one of the three unions below is a "nothing happened" arm
// ============================================================================

/**
 * Request body for `client.roles.create()`.
 *
 * 🚨 `ownerUserId` IS REQUIRED HERE and optional on the dashboard, and the
 * divergence is deliberate. The dashboard defaults the owner to the person
 * clicking; an API key's subject is the key's OWNER — whoever minted the
 * credential — so the same default would make "who owns this Role" a fact about a
 * credential rather than a decision the organization took. For a platform-operator
 * key it would seat a Nexus employee as owner of a customer's Role, and ownership
 * is the ceiling of authority over a Role.
 */
export interface CreateRoleBody {
  /** The Role's display name. */
  name: string;
  /** What the Role is for. Omit to leave it unset; `null` is also unset. */
  jobDescription?: string | null;
  /** Who owns it. Required — the server will not choose for you. */
  ownerUserId: string;
}

/**
 * A filed request to CREATE a Role, awaiting an admin's verdict.
 *
 * Its existence means no Role was created. `createdRoleId` is filled in only
 * after approval.
 */
export interface RoleCreationRequest {
  /** Request UUID. */
  id: string;
  /** The caller's own organization. */
  organizationId: string;
  /** Who asked. */
  requestedByUserId: string;
  /** The owner the caller chose, or `null` on rows filed before that column existed. */
  ownerUserId: string | null;
  /** The proposed Role name. */
  name: string;
  /** The proposed job description. */
  jobDescription: string | null;
  /** Where the request stands. */
  status: RoleAccessRequestStatus;
  /** Who decided, or `null` while `PENDING`. */
  reviewedByUserId: string | null;
  /** ISO 8601, or `null` while `PENDING`. */
  reviewedAt: string | null;
  /** The Role that approval produced, or `null` while nothing has been created. */
  createdRoleId: string | null;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
}

/**
 * Result of `client.roles.create()`.
 *
 * 🚨 READ `status`. NEVER THE HTTP CODE. When the organization's governance policy
 * requires approval this files a request and answers `status: "pending"` — nothing
 * was created, and a client that treats a 201 as success reports a Role that is
 * not there. `client.roles.getGovernance()` is not in this SDK slice; the
 * discriminant is.
 *
 * A second pending request from the same caller is a 409, not a second row.
 */
export type CreateRoleResult =
  | { status: "created"; role: Role }
  | { status: "pending"; request: RoleCreationRequest };

/**
 * Request body for `client.roles.update()`. At least one field is required — an
 * empty body is a 400 rather than a 200 that did nothing.
 *
 * 🚨 `undefined` AND `null` DIFFER ON `ownerUserId`. Omitting the key leaves the
 * owner alone; sending `null` CLEARS it. An unowned Role has nobody who may
 * transfer it, so only an org admin can ever give it an owner again.
 *
 * ⚠️ HANDING A ROLE OVER REMOVES THE OUTGOING OWNER FROM IT ENTIRELY. An owner
 * holds no membership row — ownership is the whole of their standing — so the
 * moment this field names somebody else the previous owner is in the Role in no
 * form and their permission-set rows are purged with them. Nothing in the
 * response says so.
 *
 * A transfer is gated a SECOND time, against the current owner, so holding the
 * scope and the capability is necessary and not sufficient: a refused transfer is
 * a 403 and NOTHING ELSE IN THE BODY IS APPLIED.
 */
export interface UpdateRoleBody {
  /** New display name. */
  name?: string;
  /** New job description, or `null` to clear it. */
  jobDescription?: string | null;
  /** New owner, or `null` to leave the Role unowned. Omit to leave ownership alone. */
  ownerUserId?: string | null;
}

/**
 * Response from `client.roles.update()` — the row that was just written.
 *
 * Deliberately NOT {@link RoleResponse}: readiness is derived from several extra
 * reads, and paying for them on every write to report something the write did not
 * change would make the expensive read the default. Ask `get()` for readiness.
 */
/**
 * Response from `client.roles.pause()` and `client.roles.resume()` — the Role's
 * state as it now stands.
 *
 * 🚨 THERE IS NO `changed` FLAG, AND ITS ABSENCE IS THE CONTRACT. Both calls are
 * idempotent: pausing an already-paused Role succeeds and returns the ORIGINAL
 * `pausedAt`, because that field answers *since when* and re-stamping it would
 * destroy the only fact it carries. A script must not read "nothing changed" as
 * a failure — somebody already stopped this Role is a SUCCESS, and looping or
 * alarming on it is the mistake this shape exists to prevent. `role.pausedAt`
 * is the answer.
 */
export interface RolePauseStateResponse {
  /** The Role, now stopped or now running. */
  role: Role;
}

export interface RoleUpdatedResponse {
  /** The Role after the write. */
  role: Role;
  /**
   * The fields this request actually changed.
   *
   * 🚨 READ THIS TO TELL "APPLIED" FROM "DISCARDED". This route accepts a key it
   * does not know, strips it before the write, and still answers success — so
   * `update(id, { name: "x", currency: "EUR" })` resolves with `applied:
   * ["name"]` and a Role whose currency never changed. Nothing else in the
   * response separates the two, and re-reading the Role shows the name change
   * while hiding the loss.
   *
   * Only `name`, `jobDescription` and `ownerUserId` exist here. A Role's
   * currency, its data-retention window, its paused state and its access card
   * are real product concepts with no field on this route.
   *
   * Never empty: a body that changes nothing is a 400.
   */
  applied: ("name" | "jobDescription" | "ownerUserId")[];
}

/** A filed request to DELETE an existing Role. */
export interface RoleDeletionRequest {
  /** Request UUID. */
  id: string;
  /**
   * The Role proposed for deletion. While the request is `PENDING` that Role
   * exists; once it is `APPROVED` or `SUPERSEDED` the Role is gone and this still
   * names it.
   */
  roleId: string;
  /** The caller's own organization. */
  organizationId: string;
  /** Who asked. */
  requestedByUserId: string;
  /** Where the request stands. */
  status: RoleDeletionRequestStatus;
  /** Who decided, or `null` while `PENDING` and on a `SUPERSEDED` request, which nobody reviewed. */
  reviewedByUserId: string | null;
  /** ISO 8601, or `null` while `PENDING` and on a `SUPERSEDED` request. */
  reviewedAt: string | null;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
}

/**
 * Result of `client.roles.delete()`.
 *
 * 🚨 `"pending"` MEANS THE ROLE IS STILL THERE. Only `"deleted"` means it is gone.
 *
 * 🚨 AND WHEN IT IS GONE, ITS SYSTEMS ARE NOT DELETED AND NOT REASSIGNED — THEY
 * BECOME ORPHANS. Every agent, workflow, deployment, task, template and tool the
 * Role held stops being reachable through any Role while continuing to exist and
 * to run. Nothing errors and nothing reports it. Call `listSystems()` first and
 * move what matters.
 */
export type DeleteRoleResult =
  | { status: "deleted" }
  | { status: "pending"; request: RoleDeletionRequest };

/**
 * Request body for `client.roles.attachSystem()`.
 *
 * 🚨 THIS IS A MOVE, NOT AN ADD. A system belongs to exactly one Role, so
 * attaching it here REVOKES the previous Role's claim and the permission grant its
 * members held. There is no sharing; reuse is a clone or a move.
 */
export interface AttachRoleSystemBody {
  /** Which kind of system. */
  resourceType: RoleResourceType;
  /** The system's UUID. It must already exist in this organization, or it is a 404. */
  resourceId: string;
}

/** What an attach actually did. */
export interface AttachRoleSystemResult {
  /** Always `true` — a failure is an error response, not `attached: false`. */
  attached: true;
  /**
   * 🚨 THE ROLE THIS SYSTEM WAS TAKEN FROM, or `null` when it belonged to none.
   * A non-null value means another team just lost it. This is READ IMMEDIATELY
   * BEFORE THE WRITE, so under a concurrent attach it names the holder observed a
   * moment earlier rather than a state the response guarantees.
   */
  movedFromRoleId: string | null;
}

/** What a detach actually did. */
export interface DetachRoleSystemResult {
  /** `false` when the system was already in no Role. That is a 200, never a 404. */
  removed: boolean;
  /** The Role it left, or `null` when there was nothing to leave. */
  removedFromRoleId: string | null;
}

/**
 * Request body for `client.roles.upsertMember()`.
 *
 * AN UPSERT, so sending a `tier` a person already holds is a no-op and sending the
 * other one MOVES them. The response is the row that now stands.
 *
 * ⚠️ `userId` MUST NAME SOMEBODY IN YOUR OWN ORGANIZATION. It is a Clerk `user_…`
 * id, never a UUID, and the server checks membership rather than mere existence — a
 * user id from another tenant answers 404 with the same body an id that exists
 * nowhere gets.
 */
export interface UpsertRoleMemberBody {
  /** Clerk user id (`user_…`) of somebody in your organization. */
  userId: string;
  /** `ADMIN` or `MEMBER`. The owner is never a membership row. */
  tier: RoleMemberTier;
}

/**
 * The shape every idempotent removal on this surface answers with.
 *
 * `removed: false` is a success: the row was already gone. A second call is a 200,
 * never a 404.
 */
export interface RoleRemovalResult {
  /** Whether a row actually went. */
  removed: boolean;
}

/** Request body for `client.roles.grantCollection()`. Idempotent — a re-grant returns the existing row. */
export interface GrantCollectionToRoleBody {
  /** The knowledge collection's UUID. */
  collectionId: string;
}

/** Response from `client.roles.grantCollection()`. */
export interface RoleCollectionGrantResponse {
  /** The grant row, new or pre-existing. */
  grant: RoleCollectionGrant;
}

/** Request body for `client.roles.grantWorkspace()`. Idempotent, same as the collection grant. */
export interface GrantWorkspaceToRoleBody {
  /** The file workspace's UUID. */
  workspaceId: string;
}

/** Response from `client.roles.grantWorkspace()`. */
export interface RoleWorkspaceGrantResponse {
  /** The grant row, new or pre-existing. */
  grant: RoleWorkspaceGrant;
}
