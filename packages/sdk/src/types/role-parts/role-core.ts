import type { PermissionRelation } from "../permissions";
import type { RoleCoverage } from "./role-coverage-money";
import type { RoleCollectionGrant } from "./role-grants";

/**
 * Roles — the READ surface, and the vocabulary it is stated in.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE WORDS HERE ARE THE PRODUCT'S WORDS, NOT THE DATABASE'S
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Three names differ between the screen and the schema, and every one of them is
 * a name a caller will get wrong if this file mirrors the tables instead:
 *
 * | on screen | in the database |
 * |---|---|
 * | a Role's **permission set** | `RoleGroup` |
 * | a **system** the Role holds | `RoleResource` |
 * | the "Group access" tab | `RoleGroupGrant` — a DIFFERENT table, not a permission set |
 *
 * `RoleGroup` and `RoleGroupGrant` are one character apart and mean opposite
 * things: the first is a named capability set living inside the Role, the second
 * is an organization `UserGroup` reaching one surface of it. `RoleGroupGrant` is
 * not on this surface at all — nothing below describes it.
 *
 * ── TWO FACTS THAT DECIDE WHETHER A WRITE DOES DAMAGE ────────────────────────
 *
 * They are read-relevant even though this slice writes nothing, because they are
 * what a caller has to know before acting on what it reads:
 *
 * 1. **Attaching a system to a Role MOVES it.** A unique constraint gives a
 *    system exactly one owning Role, so an attach silently removes it from
 *    whatever Role held it.
 * 2. **A system in no Role reaches nothing at runtime, and reports no error.**
 *    Detaching is therefore not a neutral act — it is a quiet disabling.
 *
 * ── EVERY NULLABLE FIELD HERE IS A STATE SOMEBODY CHOSE ──────────────────────
 *
 * `ownerUserId` is `null` because the column is (`ON DELETE SET NULL`, so
 * deleting a user never wedges their Roles). `resourceRelation: null` is a
 * capability-only permission set and never a missing value to default. And in
 * {@link RoleCoverage}, EVERY "no figure" state is a discriminated arm rather
 * than a nullable number — read the `kind`, never a `?? 0`.
 */

// ============================================================================
// Primitives
// ============================================================================

/**
 * A kind of SYSTEM a Role can hold.
 *
 * Its own closed list, deliberately NOT the permission system's
 * `PermissionResourceType`: a Role holds operational systems, which is a
 * different set from what a sharing grant is written against.
 *
 * Membership is EXCLUSIVITY, not "is it a system a Role uses". A resource is here
 * only when at most one Role per organisation can hold it. A system several Roles
 * legitimately hold at once lives in its own M:N grant table instead — a
 * Collection, a Workspace and an external Tool are all in that second group, and
 * none of them is a member of this union.
 *
 * ⚠️ A stored value can be outside this union. The column is loose TEXT rather
 * than a database enum, and two members have been retired into grant tables:
 * `collection` into {@link RoleCollectionGrant}, and `external_tool` on
 * 2026-08-13 into `RoleExternalToolGrant`. The old rows did not disappear when
 * the union narrowed. The server drops what it cannot recognise before it reaches
 * a response, so this union is right for a READ; do not reuse it to narrow a
 * value you read out of a database yourself.
 */
export type RoleResourceType =
  | "agent"
  | "workflow"
  | "deployment"
  | "ai_task"
  | "document_template";

/**
 * A user's standing inside a Role, as stored on a membership row.
 *
 * OWNER is deliberately absent: `Role.ownerUserId` is the only source of truth
 * for ownership, so the owner is a field on {@link RoleMembershipResponse}
 * rather than a row in `admins` or `members`.
 */
export type RoleMemberTier = "ADMIN" | "MEMBER";

/** Lifecycle of an access request. `REJECTED`, never `DENIED`. */
export type RoleAccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * Lifecycle of a Role deletion request: an access request's outcomes, plus
 * `SUPERSEDED` — the Role was deleted some other way (an admin deleted it
 * directly) while the request was still open, so nobody reviewed it.
 */
export type RoleDeletionRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";

/**
 * What a permission set's member may DO to the Role itself.
 *
 * One of the two independent axes a permission set carries — this one, and
 * `resourceRelation` + `surfaces`, which is what a member may REACH through it.
 * Conflating them hands out resource access nobody asked for.
 *
 * A read capability ending `.view` is held by an ordinary member; every other
 * verb — `.manage`, `.attach`, `.detach`, `.review`, `.pause`, `.resume` — is
 * not. The rule is the VERB rather than the list, and the server derives both
 * seeded sets from it, so a capability added to the catalog lands on the correct
 * side by construction. `access_request.create` is the single deliberate
 * exception: a member must be able to file into the queue that exists for them.
 *
 * ⚠️ `role.pause` and `role.resume` are a PAIR AND NOT ONE CAPABILITY. Stopping
 * a Role's work and starting it again are different claims — an on-call set that
 * may restart a Role somebody else stopped, and may not stop one itself, is the
 * audience the split exists for. Neither confers resource access, and neither
 * changes what the Role grants.
 *
 * There is no ownership-transfer member. Handing `Role.ownerUserId` over is
 * authorised by identity — the current owner, or an organisation admin — so no
 * permission set can carry it and no capability names it.
 *
 * ⚠️ `role.create` IS IN THIS UNION AND CANNOT BE GRANTED THROUGH A PERMISSION
 * SET. It is the one ORGANISATION-SCOPED capability: it names no Role, because
 * the Role does not exist yet, so it is held org-wide rather than inside a Role.
 * A permission set's `capabilities` are keyed to ONE Role, so sending it on
 * `POST`/`PATCH /roles/:roleId/permission-sets` is refused with `400
 * ORG_SCOPED_ONLY_ROLE_CAPABILITY` — it would be a row nothing could ever read.
 * It is in the union because the union mirrors the server's CATALOG, which is
 * what `GET /roles/:roleId/capabilities` answers from.
 */
export type RoleCapability =
  | "role.create"
  | "role.view"
  | "role.update"
  | "role.delete"
  | "role.pause"
  | "role.resume"
  | "team.view"
  | "team.manage"
  | "group.view"
  | "group.manage"
  | "resource.view"
  | "resource.attach"
  | "resource.detach"
  | "collection_grant.view"
  | "collection_grant.manage"
  | "workspace_grant.view"
  | "workspace_grant.manage"
  | "external_tool_grant.view"
  | "external_tool_grant.manage"
  | "coverage.view"
  | "coverage.manage"
  | "board.view"
  | "board.manage"
  | "access_request.view"
  | "access_request.create"
  | "access_request.review";

/** The template a seeded permission set came from. `null` for a custom one. */
export type RolePermissionSetTemplateKey = "maintainer" | "member";

/**
 * One app surface a permission set's resource access is narrowed to, or `"*"`
 * for every surface.
 *
 * 🚨 A STRICT ALLOW-LIST. An empty `surfaces` array reaches NOTHING; it does not
 * mean "unrestricted". That inversion is invisible in both directions, which is
 * why the wildcard is spelled rather than implied.
 */
export type RolePermissionSetSurface =
  | "inbox"
  | "playground"
  | "agents"
  | "workflows"
  | "contacts"
  | "deployments"
  | "documents"
  | "tools"
  | "knowledge"
  | "cue"
  | "customer_views"
  | "workspaces"
  | "apps"
  | "overview"
  | "*";

// ============================================================================
// The Role itself
// ============================================================================

/** A Role — the organization's unit of containment. */
export interface Role {
  /** `Role.id`, a UUID. */
  id: string;
  /** The caller's own organization. Never another tenant's. */
  organizationId: string;
  /** The Role's display name — "Support agent", "Refunds". */
  name: string;
  /** What the Role is for, as its author wrote it. */
  jobDescription: string | null;
  /** The owning user, or `null` after that user was deleted. */
  ownerUserId: string | null;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
  /**
   * ISO 8601 — when this Role's work was stopped. `null` means it is running.
   *
   * 🔴 IT DOES NOT MEAN "EVERYTHING THIS ROLE HOLDS HAS STOPPED", AND READING IT
   * THAT WAY IS WRONG ABOUT FOUR OF SIX KINDS. Only the workflows and agents a
   * Role holds are refused execution. Its deployments keep serving, its AI tasks
   * keep running, its document templates are unaffected, and its external tools
   * live on a catalogue row shared across tenants that no per-Role state may
   * touch. Call {@link RolesResource.listSystems} to see which kinds this Role
   * actually holds before reporting what a pause achieved.
   *
   * 🚨 AND IT SAYS NOTHING ABOUT ACCESS. Pausing revokes no grant and narrows no
   * permission; every member reaches afterwards exactly what they reached before.
   *
   * A timestamp rather than a boolean on purpose: a reader shown a stopped Role
   * needs to know *since when*, and it survives a repeat pause —
   * {@link RolesResource.pause} is idempotent and keeps the FIRST stop.
   */
  pausedAt: string | null;
  /**
   * The user who stopped it, or `null`.
   *
   * 🔴 `pausedAt` SET WITH THIS `null` IS A REAL STATE AND IT IS NOT "RUNNING" —
   * the column is `ON DELETE SET NULL`, so a paused Role outlives the deletion of
   * whoever paused it. Read the stop off `pausedAt` alone; this field decides
   * only whether you can name a person.
   */
  pausedByUserId: string | null;
}

// ============================================================================
// Readiness — WHICH KIND of empty, and it decides whether to retry
// ============================================================================

/**
 * WHICH KIND of empty a Role's part is, which decides whether to RETRY or not.
 *
 * Carried by {@link RolesListResponse} and {@link RoleResponse}. This field
 * arrived after the rest of the read surface, and the equality gate named both
 * response pairs by line on the way in and on the way out — which is the whole
 * reason the SDK's types are gated rather than read.
 */

/**
 * Whether the Role holds its two system permission sets.
 *
 * 🚨 `PENDING` MEANS RETRY, AND IT IS THE REASON THIS FIELD EXISTS. Permission
 * sets are NOT written when a Role is created — a background reconciler seeds
 * them on a later pass — so for an interval after creation
 * `listPermissionSets()` answers `[]`, which is byte-identical to a Role with no
 * permission model. Do not create sets by hand to fill that gap: the reconciler
 * writes the system sets on its next pass regardless, and you get duplicates.
 *
 * It can never be `ABSENT`: the seed always writes both templates and the server
 * REFUSES to delete a system set, so there is no way for a Role to be
 * deliberately without them.
 */
export type RolePermissionSetsReadiness = "READY" | "PENDING";

/**
 * Whether the Role has an owner.
 *
 * 🚨 `ABSENT` IS FINAL, NOT PENDING. Nothing schedules an owner — either the
 * owning user was deleted (the column is `ON DELETE SET NULL`) or the Role
 * predates the required-owner create path. Retrying changes nothing; assigning
 * an owner is a write somebody has to make.
 *
 * The two readiness keys have DISJOINT state sets on purpose, so a consumer
 * cannot generalise "empty means wait" from permission sets to this one.
 */
export type RoleOwnerReadiness = "READY" | "ABSENT";

/**
 * Which parts of one Role are populated yet.
 *
 * Computed on every read, never stored. There is no `coverage` key and that is a
 * refusal rather than an omission — coverage is authored by people and written by
 * no background job, so {@link RoleCoverage}'s own `coverage` discriminant and
 * `unmodelledSystems` list already say everything a readiness key would.
 */
export interface RoleReadiness {
  /** `PENDING` means the permission-set list is not yet the Role's answer. */
  permissionSets: RolePermissionSetsReadiness;
  /** `ABSENT` means no owner, and none is coming. */
  owner: RoleOwnerReadiness;
}

/** The same readiness for one Role of many, carrying the id it describes. */
export interface RoleReadinessEntry {
  /** `PENDING` means the permission-set list is not yet this Role's answer. */
  permissionSets: RolePermissionSetsReadiness;
  /** `ABSENT` means no owner, and none is coming. */
  owner: RoleOwnerReadiness;
  /** Which Role this entry describes. */
  roleId: string;
}

/** Response from `client.roles.list()`. */
export interface RolesListResponse {
  /** Every Role in the organization, without members or systems. */
  roles: Role[];
  /**
   * One readiness entry per Role, keyed by `roleId`.
   *
   * A parallel array rather than a field on each row, and rather than a map — an
   * array of objects describes itself in the OpenAPI document and in the MCP tool
   * catalog, where a record renders as an untyped object.
   */
  readiness: RoleReadinessEntry[];
}

/** Response from `client.roles.get()`. */
export interface RoleResponse {
  /**
   * One Role, WITHOUT its systems.
   *
   * The systems are a separate read under a separate scope
   * (`role_resources:read`), so listing Roles does not also hand over the
   * inventory each one owns. Call `client.roles.listSystems()` for that half.
   */
  role: Role;
  /** Which parts of this Role are populated yet. Read it before trusting an empty list. */
  readiness: RoleReadiness;
}

// ============================================================================
// Systems the Role holds
// ============================================================================

/** One system that belongs to a Role, as a `(type, id)` pair. */
export interface RoleSystemRef {
  /** Which table `resourceId` points into. */
  resourceType: RoleResourceType;
  /**
   * The system's id.
   *
   * NOT uuid-checked on a read, deliberately. The column is loose TEXT with no
   * foreign key, and rows written before the existence guard can hold a value
   * that is not a uuid — tightening a response would turn one legacy row into a
   * failed listing for the whole Role.
   */
  resourceId: string;
}

/** Response from `client.roles.listSystems()`. */
export interface RoleSystemsResponse {
  /** Every system this Role holds. Each belongs to exactly one Role. */
  resources: RoleSystemRef[];
}

// ============================================================================
// Membership
// ============================================================================

/** One membership row — a user at `ADMIN` or `MEMBER` tier. */
export interface RoleMember {
  /**
   * Membership row UUID, not the user's id. Stable across tier changes: moving a
   * member between `ADMIN` and `MEMBER` keeps it.
   */
  id: string;
  /** The Role this membership is on. */
  roleId: string;
  /** The caller's own organization. */
  organizationId: string;
  /** Clerk user id (`user_…`). */
  userId: string;
  /** `ADMIN` or `MEMBER`. The owner is never a row here. */
  tier: RoleMemberTier;
  /** Who added them, or `null` when the system did. */
  addedByUserId: string | null;
  /** ISO 8601 — when they joined the Role. Stable across tier changes, like `id`. */
  createdAt: string;
}

/**
 * Response from `client.roles.listMembers()`.
 *
 * An object rather than a bare array because `OWNER` is not a row: it is a
 * column on the Role, so the owner can only be reported beside the two tiers
 * that do have rows.
 */
export interface RoleMembershipResponse {
  /** The Role these people are on. */
  roleId: string;
  /** The owner, or `null` after that user was deleted. Not in `admins`. */
  ownerUserId: string | null;
  /** Members at `ADMIN` tier. */
  admins: RoleMember[];
  /** Members at `MEMBER` tier. */
  members: RoleMember[];
}

// ============================================================================
// Permission sets  (database: RoleGroup — NOT RoleGroupGrant)
// ============================================================================

/**
 * One PERMISSION SET on one Role — a named capability bundle living inside it.
 *
 * The screen calls this a permission set; the table is `RoleGroup`. It is NOT
 * `RoleGroupGrant`, which is the "Group access" tab and describes an
 * organization `UserGroup` reaching one surface of the Role.
 *
 * `key` is non-null exactly when `isSystem` is true — the database enforces the
 * biconditional, so a reader may rely on it.
 */
export interface RolePermissionSet {
  /** Permission-set UUID. */
  id: string;
  /** The Role it lives inside. */
  roleId: string;
  /** The seeded template, or `null` for a customer-authored set. */
  key: RolePermissionSetTemplateKey | null;
  /** Display name. */
  name: string;
  /** Ships with Nexus. Its capability set is immutable in the product. */
  isSystem: boolean;
  /**
   * What this set confers on the Role's systems, or `null` for a
   * capability-only set.
   *
   * `null` is a chosen state, never a missing value. Reading it as `"viewer"`
   * hands out resource access nobody asked for.
   */
  resourceRelation: PermissionRelation | null;
  /** The set's order within the Role. */
  position: number;
  /**
   * What a member may DO to the Role.
   *
   * A capability this build has since removed is DROPPED by the server rather
   * than returned, so nothing here grants something the product no longer knows.
   */
  capabilities: RoleCapability[];
  /**
   * The surfaces `resourceRelation` is narrowed to.
   *
   * 🚨 EMPTY REACHES NOTHING. `["*"]` reaches everything. Never read `[]` as
   * unrestricted.
   */
  surfaces: RolePermissionSetSurface[];
  /** How many users are in the set. The roster is a different read. */
  memberCount: number;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
}

/** Response from `client.roles.listPermissionSets()`. */
export interface RolePermissionSetsResponse {
  /** Each named capability set inside the Role. Not group grants. */
  permissionSets: RolePermissionSet[];
}
