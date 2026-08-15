import type { PermissionRelation, PermissionSubjectType } from "./permissions";

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
 * What a permission set's member may DO to the Role itself.
 *
 * One of the two independent axes a permission set carries — this one, and
 * `resourceRelation` + `surfaces`, which is what a member may REACH through it.
 * Conflating them hands out resource access nobody asked for.
 *
 * A read capability ending `.view` is held by an ordinary member; the `.manage`
 * / `.attach` / `.detach` / `.review` half is not.
 *
 * There is no ownership-transfer member. Handing `Role.ownerUserId` over is
 * authorised by identity — the current owner, or an organisation admin — so no
 * permission set can carry it and no capability names it.
 */
export type RoleCapability =
  | "role.view"
  | "role.update"
  | "role.delete"
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
  | "ultimate_cue"
  | "customer_views"
  | "workspaces"
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
  /** Membership row UUID, not the user's id. */
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
  /** ISO 8601. */
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

// ============================================================================
// Coverage — READ THE DISCRIMINANTS, NEVER A NULLABLE NUMBER
// ============================================================================

/** One of the six functions a coverage formula may apply. */
export type CoverageFunction = "add" | "sub" | "mul" | "div" | "min" | "max";

/** A time unit a coverage input may be stated in. */
export type CoverageTimeUnit = "minute" | "hour" | "day" | "week" | "month" | "year";

/** Every way evaluating one formula can fail. */
export type CoverageEvaluationFailureCode =
  | "DIVISION_BY_ZERO"
  | "NON_FINITE"
  | "DIMENSION_MISMATCH"
  | "EXPONENT_OUT_OF_RANGE"
  | "PERIOD_BASIS_MISMATCH"
  | "PERIOD_BASIS_OUT_OF_RANGE"
  | "UNRESOLVED_REFERENCE";

/** Every named problem a coverage figure can carry. */
export type CoverageWarningCode =
  | "WORKING_TIME_MODEL_INVALID"
  | "WORKLOAD_MODEL_INVALID"
  | "WORKLOAD_WRONG_DIMENSION"
  | "WORKLOAD_ZERO_HOURS"
  | "WORKLOAD_NEGATIVE_HOURS"
  | "WORKLOAD_WRONG_PERIOD_BASIS"
  | "IMPACT_WRONG_PERIOD_BASIS"
  | "IMPACT_INADMISSIBLE_PERIOD_BASIS"
  | "RATIO_NOT_FINITE"
  | "IMPACT_MODEL_INVALID"
  | "IMPACT_WRONG_DIMENSION"
  | "RATIO_EXCEEDS_ONE"
  | "RATIO_BELOW_ZERO"
  | "WORKLOAD_MONEY_MODEL_INVALID"
  | "WORKLOAD_MONEY_WRONG_DIMENSION"
  | "WORKLOAD_MONEY_INADMISSIBLE_PERIOD_BASIS"
  | "WORKLOAD_MONEY_WRONG_PERIOD_BASIS"
  | "IMPACT_MONEY_MODEL_INVALID"
  | "IMPACT_MONEY_WRONG_DIMENSION"
  | "IMPACT_MONEY_INADMISSIBLE_PERIOD_BASIS"
  | "IMPACT_MONEY_WRONG_PERIOD_BASIS";

/** How much a warning matters. */
export type CoverageWarningSeverity = "error" | "warning";

/** Why a Role has no coverage percentage at all. */
export type CoverageNotModelledReason =
  | "NO_WORKLOAD_MODEL"
  | "NO_WORKING_TIME_MODEL"
  | "WORKING_TIME_MODEL_INVALID"
  | "WORKLOAD_MODEL_INVALID"
  | "WORKLOAD_WRONG_DIMENSION"
  | "WORKLOAD_ZERO_HOURS"
  | "WORKLOAD_NEGATIVE_HOURS"
  | "WORKLOAD_WRONG_PERIOD_BASIS"
  | "RATIO_NOT_FINITE";

/** Why a Role has no money figures at all. */
export type CoverageMoneyNotModelledReason = "NO_CURRENCY";

/** Why saved work cannot be re-expressed in money. */
export type CoverageSavingsProjectionUnavailableReason =
  | "NO_CURRENCY"
  | "NO_WORKLOAD_COST"
  | "NEGATIVE_WORKLOAD_COST"
  | "NO_WORKLOAD_HOURS"
  | "RATE_NOT_FINITE"
  | "AMOUNT_NOT_FINITE"
  | "IMPACT_HOURS_UNAVAILABLE";

/** Which money term of a system a warning is about. */
export type CoverageMoneyTermName = "revenue" | "cost";

/** Who chose a working-time assumption. */
export type CoverageWorkingTimeOrigin = "ORGANIZATION" | "ROLE";

/** Where in a formula an evaluation failed. */
export type CoverageEvaluationSite =
  | { kind: "input"; key: string }
  | { kind: "step"; index: number; fn: CoverageFunction }
  | { kind: "result" };

/** A typed evaluation failure. */
export interface CoverageEvaluationFailure {
  /** What went wrong. */
  code: CoverageEvaluationFailureCode;
  /** Human-readable detail. Not a stable identifier — switch on `code`. */
  message: string;
  /** Where it went wrong, precise enough to highlight. */
  at: CoverageEvaluationSite;
}

/** What one warning is about. `id` is a system's `RoleResource` row id. */
export type CoverageWarningSubject =
  | { kind: "workingTime" }
  | { kind: "workload" }
  | { kind: "impact"; id: string }
  | { kind: "ratio" }
  | { kind: "workloadMoney"; term: CoverageMoneyTermName }
  | { kind: "impactMoney"; id: string; term: CoverageMoneyTermName };

/** One named problem with a coverage figure. */
export interface CoverageWarning {
  /** What the problem is. */
  code: CoverageWarningCode;
  /** How much it matters. */
  severity: CoverageWarningSeverity;
  /** What it is about. */
  subject: CoverageWarningSubject;
  /** Human-readable detail. */
  message: string;
}

/** Whether a coverage figure can be trusted, and why not. */
export interface CoverageIntegrity {
  /** `DEGRADED` means at least one input did not evaluate. */
  status: "OK" | "DEGRADED";
  /** Every problem, named. Empty when `status` is `OK`. */
  warnings: readonly CoverageWarning[];
}

/**
 * A coverage figure, or an explicit statement that there is none.
 *
 * 🚨 A Role with no workload model has NO percentage — not 0%, not 100%. Read
 * `kind`. `ratio` is a fraction (`0.1828`), never a percentage (`18.28`).
 */
export type CoverageRatio =
  | { kind: "not-modelled"; reason: CoverageNotModelledReason }
  | { kind: "modelled"; ratio: number };

/**
 * One money term of one system.
 *
 * Three arms rather than a nullable number, because "declares no model",
 * "declares a broken one" and "is worth exactly zero" are three different facts
 * and a `null` flattens the first two into each other.
 */
export type CoverageMoneyTerm =
  | { kind: "absent" }
  | { kind: "amount"; amount: number }
  | {
      kind: "failed";
      /** `null` when the model evaluated cleanly to the wrong dimension or window. */
      failure: CoverageEvaluationFailure | null;
    };

/**
 * The money side of one Role's coverage.
 *
 * ONE CURRENCY for the whole object, and it lives INSIDE the `modelled` arm — so
 * an amount can never be read without the currency it is stated in. The engine
 * never converts.
 */
export type RoleCoverageMoney =
  | { kind: "not-modelled"; reason: CoverageMoneyNotModelledReason }
  | {
      kind: "modelled";
      /** ISO 4217 alphabetic code, upper case. Never a symbol. */
      currency: string;
      totals: {
        /**
         * 🚨 THE ROLE'S OWN ANNUAL LABOUR COST — salaries and seats. `null`
         * when nobody modelled it.
         */
        workloadCost: number | null;
        /** Revenue the Role holds that is attached to no system. `null` when unmodelled. */
        workloadRevenue: number | null;
        /** Revenue the systems generate. */
        revenue: number;
        /** What the systems cost. */
        cost: number;
        /**
         * `revenue - cost` — the automation's own P&L, blind to salaries.
         * NEVER render it as the Role's net cost: it omits `workloadCost`.
         */
        net: number;
      };
    };

/**
 * Saved work re-expressed in money.
 *
 * The `projected` arm carries the rate it was produced with, and that is not
 * decoration — it is what stops a reader taking a projection for a measurement.
 */
export type CoverageSavingsProjection =
  | { kind: "unavailable"; reason: CoverageSavingsProjectionUnavailableReason }
  | {
      kind: "projected";
      /** The projected amount, in `currency`. */
      amount: number;
      /** ISO 4217 alphabetic code, upper case. */
      currency: string;
      /**
       * 🚨 A BLENDED PAY RATE — the Role's labour cost divided by its worked
       * hours, per person-hour.
       */
      ratePerHour: number;
    };

/** One effective working-time assumption, and who chose it. */
export interface ResolvedCoverageWorkingTimeSetting {
  /** The number in force. */
  value: number;
  /** Whose value it is. */
  origin: CoverageWorkingTimeOrigin;
}

/**
 * The three assumptions the coverage figure rests on, each with its origin.
 *
 * Per FIELD rather than per group, because the override is per field: a Role on
 * a four-day week keeps the organization's working year.
 */
export interface ResolvedCoverageWorkingTime {
  hoursPerDay: ResolvedCoverageWorkingTimeSetting;
  daysPerWeek: ResolvedCoverageWorkingTimeSetting;
  workingWeeksPerYear: ResolvedCoverageWorkingTimeSetting;
}

/** The dimension of a coverage quantity, as integer exponents. */
export interface CoverageDimension {
  time: number;
  person: number;
  event: number;
  money: number;
}

/** A reference to an input, or to a strictly earlier step. */
export type CoverageRef = { kind: "input"; key: string } | { kind: "step"; index: number };

/** One authored input of a coverage formula: a magnitude and its dimension. */
export interface CoverageFormulaInput {
  /** Stable identifier, never a display string. */
  key: string;
  /** The magnitude the author entered. */
  value: number;
  /** What kind of quantity it is. */
  dimension: CoverageDimension;
  /**
   * The unit the magnitude's own TIME dimension is stated in — 12 MINUTES per
   * ticket. Distinct from {@link CoverageFormulaInput.perPeriod}.
   */
  timeUnit?: CoverageTimeUnit;
  /**
   * The window the magnitude accumulates over — 40 tickets per WEEK. Absent
   * means the magnitude is absolute.
   */
  perPeriod?: CoverageTimeUnit;
  /** What the author called it. */
  label?: string;
}

/** One step of a coverage formula: a function applied to earlier values. */
export interface CoverageFormulaStep {
  /** Which function. */
  fn: CoverageFunction;
  /** At least two references, to inputs or to strictly earlier steps. */
  args: CoverageRef[];
  /** What the author called it. */
  label?: string;
}

/** A stored coverage formula. `result` names the value the model produces. */
export interface CoverageFormula {
  /** Always `1` today. A second version would be a second arm, not a wider number. */
  version: 1;
  /** The authored magnitudes. */
  inputs: CoverageFormulaInput[];
  /** The arithmetic, in order. */
  steps: CoverageFormulaStep[];
  /** Which input or step is the model's answer. */
  result: CoverageRef;
}

/**
 * A system attached to the Role that nobody has modelled.
 *
 * 🚨 THIS SHAPE CARRIES NO NUMBER, AND THAT IS THE DESIGN. There is no
 * `personHours: 0` here and no nullable one: a zero for a system nobody measured
 * is a fabricated measurement.
 */
export interface UnmodelledRoleSystem {
  /** The `RoleResource` row id — the same key every warning's `subject.id` uses. */
  id: string;
  /** Which kind of system. A loose string, because a retired kind can appear. */
  resourceType: string;
  /** Which system. */
  resourceId: string;
  /** Why it produced no contribution. */
  reason: "NO_IMPACT_MODEL";
}

/** One system's contribution to the coverage numerator. */
export interface RoleCoverageContribution {
  /** The `RoleResource` row id — what every warning's `subject.id` refers to. */
  id: string;
  /** Which kind of system. A loose string, because a retired kind can appear. */
  resourceType: string;
  /** Which system. */
  resourceId: string;
  /** Person-hours per year, or `null` when the model did not evaluate. */
  personHours: number | null;
  /**
   * The authored saved-work model — the operands behind `personHours`.
   *
   * `null` only when the stored JSON did not validate, exactly as
   * {@link RoleCoverage.workload} is. Never `null` for a missing model: a row
   * exists only because somebody authored one.
   */
  formula: CoverageFormula | null;
  /** Why it did not evaluate, or `null` when it did. */
  failure: CoverageEvaluationFailure | null;
  /** Every input key a real measurement replaced. */
  measuredInputKeys: readonly string[];
  /** Money this system generates per year, in the Role's one currency. */
  revenue: CoverageMoneyTerm;
  /** Money this system costs per year, in the Role's one currency. */
  cost: CoverageMoneyTerm;
  /** This row's `personHours` in money. SAVINGS ONLY — `revenue` does not enter it. */
  savingsProjection: CoverageSavingsProjection;
}

/**
 * One Role's automation coverage, and every figure behind it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS RESPONSE CARRIES LABOUR COST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `money.totals.workloadCost` is the Role's annual salary-and-seat cost, and
 * `savingsProjection.ratePerHour` is that cost divided by its worked hours — a
 * blended pay rate. Holding the `role_coverage:read` scope is NECESSARY AND NOT
 * SUFFICIENT: the server also evaluates the Role's own `coverage.view`
 * capability against the API key's OWNER, so a key can hold the scope and still
 * receive a 403.
 *
 * ── HOW TO READ IT WITHOUT INVENTING A MEASUREMENT ───────────────────────────
 *
 * - Read `coverage.kind`. `"not-modelled"` is not 0% and not 100%.
 * - An empty `contributions` with a populated `unmodelledSystems` means NOBODY
 *   HAS MODELLED ANYTHING, never "measured at zero". Every `RoleResource` the
 *   Role holds appears in exactly one of the two arrays.
 * - 🚨 THOSE TWO ARRAYS COVER ONE OF THE FOUR TABLES A ROLE HOLDS SYSTEMS IN.
 *   A Collection, a Workspace or an external Tool reaches a Role by GRANT, and no
 *   impact model can point at one, so neither array can carry it —
 *   `grantedSystems` counts all three. A total built from `contributions` and
 *   `unmodelledSystems` alone is a count of part of what the Role holds, and this
 *   line said the opposite until 2026-08-12.
 * - `workingTime` is `null` if and only if `coverage` is
 *   `{ kind: "not-modelled", reason: "NO_WORKING_TIME_MODEL" }`.
 * - `workload` is the authored DENOMINATOR. Without it a percentage is an
 *   assertion rather than a checkable figure.
 */
export interface RoleCoverage {
  /** The Role this figure is about. */
  roleId: string;
  /** The percentage, or a named statement that there is none. */
  coverage: CoverageRatio;
  /** The denominator in person-hours per year, or `null` when there is none. */
  workloadPersonHours: number | null;
  /** The numerator: the sum of the contributions that evaluated. */
  impactPersonHours: number;
  /** One entry per system that HAS an impact model. */
  contributions: readonly RoleCoverageContribution[];
  /** Every input key a measurement replaced, across every model evaluated. */
  measuredInputKeys: readonly string[];
  /** Whether the figure can be trusted, and why not. */
  integrity: CoverageIntegrity;
  /** The assumptions the figure rests on, or `null` when none were ever stated. */
  workingTime: ResolvedCoverageWorkingTime | null;
  /** The authored denominator. `null` when absent or unparseable. */
  workload: CoverageFormula | null;
  /** The money figures, or a named statement that there are none. */
  money: RoleCoverageMoney;
  /**
   * `impactPersonHours` in money at the Role's blended rate.
   *
   * The numerator multiplied ONCE — not the sum of the rows' projections. It is
   * outside `money.totals` because those are measured amounts and this is hours
   * wearing a currency.
   */
  savingsProjection: CoverageSavingsProjection;
  /** Systems the Role holds that nobody has modelled. Carries no number. */
  unmodelledSystems: readonly UnmodelledRoleSystem[];
  /**
   * How many systems the Role holds by GRANT rather than by placement.
   *
   * The population `contributions` and `unmodelledSystems` structurally cannot
   * cover: an impact model keys onto a `RoleResource` row, and a Collection, a
   * Workspace or an external Tool grant has none. Counts rather than identities,
   * because the job of these numbers is to let a caller state what its own total
   * excludes.
   *
   * Zero is a measurement — all three grant tables are read on the same request
   * as the coverage figures, so `0` never means "nobody looked".
   */
  grantedSystems: GrantedRoleSystems;
}

/** How many systems a Role holds by grant, per kind. */
export interface GrantedRoleSystems {
  /** Collection grants held by this Role. */
  collections: number;
  /** Workspace grants held by this Role. */
  workspaces: number;
  /**
   * External tool (plugin) grants held by this Role.
   *
   * 🔴 THE NEWEST OF THE THREE AND THE ONE MOST LIKELY TO BE NON-ZERO. A client
   * written before 2026-08-13 renders a "systems" sentence that silently
   * excludes it, so a total that adds `collections` and `workspaces` alone is
   * now short by the count customers are most likely to notice.
   */
  externalTools: number;
}

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

/** A filed request to DELETE an existing Role, awaiting an admin's verdict. */
export interface RoleDeletionRequest {
  /** Request UUID. */
  id: string;
  /** The Role proposed for deletion. It still exists. */
  roleId: string;
  /** The caller's own organization. */
  organizationId: string;
  /** Who asked. */
  requestedByUserId: string;
  /** Where the request stands. */
  status: RoleAccessRequestStatus;
  /** Who decided, or `null` while `PENDING`. */
  reviewedByUserId: string | null;
  /** ISO 8601, or `null` while `PENDING`. */
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
 * answers 201 with `false` rather than 409, because the caller asked for a state
 * that already holds.
 *
 * ⚠️ THE STATUS CODE IS NOT THE DISCRIMINANT. Every POST on this surface answers
 * 201, `upsertMember()` included when it merely moves a tier and creates nothing.
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

/** Filter for the creation- and deletion-request lists. */
export interface ListRoleManagementRequestsParams {
  /** Return only requests in this state. Omit for every state. */
  status?: RoleAccessRequestStatus;
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
  /** The matching requests. Each names a Role that is STILL THERE. */
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

/** One allow-list row for one action. */
export interface RoleManagementGrant {
  /** The kind of principal allowed. */
  subjectType: PermissionSubjectType;
  /** The principal's id — `null` exactly when `subjectType` is `"organization"`. */
  subjectId: string | null;
}

/** One action's governance settings. */
export interface RoleManagementActionSettings {
  /** Which action this row governs. */
  action: RoleManagementAction;
  /** Who may perform it. */
  grants: RoleManagementGrant[];
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

// ============================================================================
// The job model — REQUIRED-AND-NULLABLE, which is the trap in this whole family
// ============================================================================

/**
 * Request body for the job-type create and update.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 EVERY FIELD IS REQUIRED. THE NULLABLE ONES MUST BE SENT AS `null`.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * There is no partial update here — the route is a PUT and the schema is strict,
 * so a field you omit is a validation error rather than "leave it alone". Read
 * the current row with `client.roles.listJobTypes()`, change what you mean, and
 * send the whole object back.
 *
 * **`null` and `0` are different facts and only one of them is a measurement.**
 * `fte: null` is a full contract; `fte: 0` is not a value the server accepts.
 * A `null` expression means "use the basis' built-in one"; an EMPTY STRING is
 * legal and evaluates to zero, which is what a credit type with no cost wants.
 * Never substitute `0` for an absent number.
 *
 * 🚨 `basis: "CUSTOM"` WITH `costExpression: null` IS REFUSED, and the refusal is
 * the point: CUSTOM has no built-in cost expression, so a null one would price
 * every scope line quantifying this type at ZERO with no error on any read.
 */
export interface RoleJobTypeBody {
  /** What the arrangement is called: "Support agent, Manila". */
  name: string;
  /** How the arithmetic works. `CUSTOM` obliges `costExpression`. */
  basis: RoleJobTypeBasis;
  /** Which heading it subtotals under. */
  group: RoleJobTypeGroup;
  /** The listing band in the picker. Display, not arithmetic. */
  category: string;
  /** What ONE unit of this type is: "people", "seats", "h / wk". */
  quantityUnit: string;
  /** The author's sentence, or `null`. REQUIRED — send `null` for none. */
  note: string | null;
  /**
   * The fraction of a full contract a SALARY line buys — `0.6` for 60% part-time.
   * Must be `> 0` and `<= 1`.
   *
   * REQUIRED: send `null` for a full contract, never `0` and never omitted.
   */
  fte: number | null;
  /** The rate inputs. AT LEAST ONE — a type with none prices every line at zero. */
  parts: RoleJobTypePart[];
  /** Overrides the basis' cost-per-unit expression. `null` uses the basis'. */
  costExpression: string | null;
  /** Overrides the basis' hours-per-unit expression. `null` uses the basis'. */
  hoursExpression: string | null;
  /** Revenue one unit credits back a year. `null` when unmodelled. */
  revenueExpression: string | null;
}

/** Response from the job-type create and update. */
export interface RoleJobTypeWriteResponse {
  /** The job type after the write. */
  jobType: RoleJobType;
  /**
   * How many scope lines were REPRICED by this write, across every Role.
   *
   * A job type is shared, so editing one changes what every Role quantifying it
   * costs. A non-zero count here is that blast radius, reported rather than left
   * to be discovered.
   */
  repricedScopeLines: number;
}

/** Response from `client.roles.deleteJobType()`. */
export interface RoleJobTypeDeleteResponse {
  /** The job type that was removed. */
  id: string;
}

/**
 * Request body for `client.roles.upsertAutomationSettings()`.
 *
 * Org-wide working-time assumptions. Every number must be finite and `> 0` —
 * there is no `null` for these three, because a zero-length day makes every
 * coverage figure in the organization unusable.
 */
export interface RoleAutomationSettingsBody {
  /** Hours in a working day. Finite and `> 0`. */
  hoursPerDay: number;
  /** Days in a working week. Finite and `> 0`. */
  daysPerWeek: number;
  /** Working weeks in a year. Finite and `> 0`. */
  workingWeeksPerYear: number;
  /**
   * ISO 4217 alphabetic code, upper case — never a symbol.
   *
   * REQUIRED and nullable: `null` means the organization has stated no currency,
   * and then every money figure in every coverage read is `not-modelled`.
   */
  currency: string | null;
}

/** The organization's automation settings. */
export interface RoleAutomationSettings {
  /** The organization these apply to. */
  organizationId: string;
  /** Hours in a working day. */
  hoursPerDay: number;
  /** Days in a working week. */
  daysPerWeek: number;
  /** Working weeks in a year. */
  workingWeeksPerYear: number;
  /** ISO 4217 code, or `null` when none is stated. */
  currency: string | null;
}

// ============================================================================
// Scope lines — the Role's authored workload
// ============================================================================

/** One scope line as a caller writes it. No `id`: identity is the array index. */
export interface RoleScopeLineInput {
  /** A row of the organization's job-type library. */
  jobTypeId: string;
  /**
   * How many units. Finite and `>= 0`.
   *
   * ZERO IS LEGAL and is not the same as deleting the line — a line stated at
   * zero is a decision recorded, and it keeps its `scope` sentence.
   */
  quantity: number;
  /** What this line covers, in the author's words. Up to 200 characters. */
  scope: string;
}

/**
 * Request body for `client.roles.replaceScopeLines()`.
 *
 * 🚨 THIS REPLACES THE WHOLE LIST. A line's identity is its index in the array,
 * so sending a subset DELETES everything absent from it. Read with
 * `listScopeLines()`, modify, send the whole list back. `[]` empties the Role's
 * workload, which makes its coverage `not-modelled`.
 */
export interface RoleScopeLinesBody {
  /** Every line the Role should have afterwards. Up to 200. */
  lines: RoleScopeLineInput[];
}

/** One scope line as the API returns it. */
export interface RoleScopeLine {
  /** A row of the organization's job-type library. */
  jobTypeId: string;
  /** How many units. */
  quantity: number;
  /** What this line covers. */
  scope: string;
  /** Line UUID. */
  id: string;
  /** The list's own order. */
  position: number;
  /** ISO 8601. */
  updatedAt: string;
}

/** Response from the scope-line read and replace. */
export interface RoleScopeLinesResponse {
  /** The lines, in order. */
  lines: RoleScopeLine[];
  /**
   * Variable keys these lines' job types reference that the Role does NOT define.
   *
   * 🚨 NOT DECORATION. An unresolved variable means a part has no value, so the
   * lines depending on it are priced from an incomplete model. Non-empty here is
   * worth surfacing to a human — define them with `replaceVariables()`.
   */
  unresolvedVariables: string[];
}

// ============================================================================
// Variables — the values a job type's parts reference
// ============================================================================

/** One variable as a caller writes it. */
export interface RoleVariableInput {
  /** The key a job-type part references. Lower-case start, then word characters. */
  key: string;
  /** What it is called on screen. */
  label: string;
  /** Free text, or `null`. REQUIRED — send `null` for none. */
  description: string | null;
  /** How it reads — "€ a year", "%". `null` for none. REQUIRED. */
  unit: string | null;
  /**
   * The value.
   *
   * REQUIRED and nullable, and the distinction is load-bearing: `null` means
   * UNSET, so any part referencing this key is unresolved and its line is priced
   * from an incomplete model. It is NOT zero. Sending `0` asserts a measured zero.
   */
  value: number | null;
}

/**
 * Request body for `client.roles.replaceVariables()`.
 *
 * 🚨 REPLACES THE WHOLE LIST, exactly like the scope lines. Keys must be unique.
 */
export interface RoleVariablesBody {
  /** Every variable the Role should have afterwards. Up to 128. */
  variables: RoleVariableInput[];
}

/** One variable as the API returns it. */
export interface RoleVariable {
  /** The key a job-type part references. */
  key: string;
  /** Display label. */
  label: string;
  /** Free text, or `null`. */
  description: string | null;
  /** Display unit, or `null`. */
  unit: string | null;
  /** The value, or `null` for UNSET — never read as zero. */
  value: number | null;
  /** Variable UUID. */
  id: string;
  /** The list's own order. */
  position: number;
  /** ISO 8601. */
  updatedAt: string;
}

/** Response from the variable read and replace. */
export interface RoleVariablesResponse {
  /** The variables, in order. */
  variables: RoleVariable[];
}

// ============================================================================
// Working year — the Role's override of the org's calendar
// ============================================================================

/**
 * Request body for `client.roles.upsertWorkingYear()`.
 *
 * 🚨 EVERY FIELD IS REQUIRED AND NULLABLE, and `null` is not `0`. `null` means
 * "this Role states no override, use the organization's value"; `0` asserts a
 * measured zero — zero paid leave, zero public holidays. They produce different
 * coverage denominators.
 */
export interface RoleWorkingYearBody {
  /** Weeks in the calendar year. `> 0` and `<= 53`, or `null` for no override. */
  calendarWeeks: number | null;
  /** Paid leave, in weeks. `0`–`53`, or `null` for no override. */
  paidLeaveWeeks: number | null;
  /** Public holidays, in days. `0`–`365`, or `null` for no override. */
  publicHolidayDays: number | null;
  /** Expected sickness, in days. `0`–`365`, or `null` for no override. */
  sicknessDays: number | null;
}

/** The Role's working year, as the API returns it. */
export interface RoleWorkingYear {
  /** Weeks in the calendar year, or `null` for no override. */
  calendarWeeks: number | null;
  /** Paid leave in weeks, or `null`. */
  paidLeaveWeeks: number | null;
  /** Public holidays in days, or `null`. */
  publicHolidayDays: number | null;
  /** Expected sickness in days, or `null`. */
  sicknessDays: number | null;
  /** Row UUID. */
  id: string;
  /** The Role it belongs to. */
  roleId: string;
  /** ISO 8601. */
  updatedAt: string;
}

// ============================================================================
// System policy — the defaults a Role's systems start under
// ============================================================================

/**
 * Request body for `client.roles.upsertSystemPolicy()`.
 *
 * All five are REQUIRED booleans — a PUT of the whole policy, never a patch, so
 * an omitted flag is a validation error rather than "leave it alone".
 */
export interface RoleSystemPolicyBody {
  /** Systems in this Role may propose changes. */
  allowProposals: boolean;
  /** Their output needs human review before it is acted on. */
  requireReview: boolean;
  /** A newly attached system starts paused rather than running. */
  startPaused: boolean;
  /** Approved changes are pushed automatically. */
  autoPush: boolean;
  /** Notify when a human takes over from a system. */
  notifyTakeover: boolean;
}

/** The Role's system policy, as the API returns it. */
export interface RoleSystemPolicy {
  /** Systems may propose changes. */
  allowProposals: boolean;
  /** Output needs human review. */
  requireReview: boolean;
  /** A newly attached system starts paused. */
  startPaused: boolean;
  /** Approved changes are pushed automatically. */
  autoPush: boolean;
  /** Notify on human takeover. */
  notifyTakeover: boolean;
  /** Row UUID. */
  id: string;
  /** The Role it belongs to. */
  roleId: string;
  /** ISO 8601. */
  updatedAt: string;
}

// ============================================================================
// The Role's WORK — what it is answerable for, and what it proposes to do
//
// Two documents that sit side by side on one screen and are independent in the
// database. Their authoring grains are OPPOSITE and neither is an oversight: a
// duty is added and removed ONE AT A TIME because the SERVER mints its id, so a
// whole-list replace would have to re-mint — and a task's coverage checklist
// references a duty by id. A task list can be replaced whole because the body
// NAMES each surviving row, which is what keeps its id.
// ============================================================================

/** One duty the Role is answerable for, in its author's own words. */
export interface RoleResponsibility {
  /** Row UUID. Stable across edits of this duty and of every other one. */
  id: string;
  /** The duty itself. Never blank — the column refuses it. */
  text: string;
  /**
   * Its place in the list, `0`-based.
   *
   * ⚠️ AN INSERTION ORDER, NOT A DENSE RANK. Removing a duty leaves a hole —
   * 0, 1, 3 — and nothing backfills it. Render the list, not the integer.
   */
  position: number;
  /** ISO 8601. */
  updatedAt: string;
}

/** Every duty the Role is answerable for, in read order. */
export interface RoleResponsibilitiesResponse {
  /** The duties, ordered by `(position, createdAt, id)`. */
  responsibilities: RoleResponsibility[];
}

/** Add ONE duty. The server assigns its id and appends it at the end. */
export interface RoleResponsibilityBody {
  /**
   * The duty. Trimmed before it is measured, so a row of spaces is a 400 rather
   * than a duty that renders as an empty line nobody can select. 500 characters
   * is the ceiling; anything longer is a job description, which belongs on
   * `updateRole()`.
   */
  text: string;
}

/**
 * What removing a duty answers with.
 *
 * 🚨 NO `removed` BOOLEAN, unlike the grant and system detaches. Those are
 * idempotent and need a field to say which happened; this route answers 404 for
 * a duty that is not this Role's, so a success always means exactly one row went.
 */
export interface RoleResponsibilityRemoved {
  /** The duty that was removed. */
  id: string;
}

/**
 * Who or what a proposed task is assigned to.
 *
 * ⚠️ IDS AND NO DISPLAY NAME, deliberately. The resource arm spans every table
 * {@link RoleResourceType} names, behind a loose `resourceType` with no foreign
 * key to join through, so a name would cost one query per kind on every read.
 * Resolve a `userId` with `listMembers()` and a `resourceId` with
 * `listSystems()`.
 *
 * ⚠️ `resourceType` IS A LOOSE STRING ON THE READ AND NARROW ON THE WRITE, which
 * is the same split {@link RoleResourceType} states for itself: a stored row may
 * carry a retired kind, and tightening a response would fail a whole listing over
 * one legacy row.
 */
export type RoleTaskAssignment =
  | { kind: "person"; userId: string }
  | { kind: "resource"; resourceType: string; resourceId: string };

/**
 * ⚠️ AN ASSIGNMENT HAS NO ID AT ALL, unlike the task above it — the ARM OBJECT is
 * the identity. Assignment rows are re-created beneath a surviving task on each
 * save, which no consumer can observe because none is published or referenced.
 *
 * 🚨 THERE IS NO `person:<userId>` STRING FORM ON THE WIRE, and there never has
 * been. That spelling is the DATABASE's uniqueness key on the row
 * (`@@unique([taskId, userId])` and `@@unique([taskId, resourceType,
 * resourceId])`); it was documented here and in the CLI's `--help` as though it
 * were the payload, and sending it is refused. A statement that is true about
 * one layer and addressed to another reads as checked (NEX-3778).
 */

/** One task the Role proposes to run. */
export interface RoleTask {
  /**
   * Row UUID, and a DURABLE handle.
   *
   * A task submitted back to the dashboard's save with its `id` is updated in
   * place and keeps it; that is what lets a task's coverage checklist reference
   * it at all. Safe to store and to correlate across sessions.
   */
  id: string;
  /** What the task is. */
  name: string;
  /** One line, or `null` when nobody has written one. */
  description: string | null;
  /** Occurrences a year, or `null` when nobody has stated it. `null` is not `0`. */
  occurrencesPerYear: number | null;
  /** People a year, or `null` when nobody has stated it. `null` is not `0`. */
  peoplePerYear: number | null;
  /** Revenue a year in the organization's currency, or `null` when unstated. */
  revenuePerYear: number | null;
  /** Its place in the list, `0`-based. The read is ordered by it. */
  position: number;
  /** Who and what runs it. */
  assignments: RoleTaskAssignment[];
  /** ISO 8601. */
  updatedAt: string;
}

/** The Role's whole task list, in read order. */
export interface RoleTasksResponse {
  /** The tasks, ordered by `position`. */
  tasks: RoleTask[];
}

/**
 * One assignment as a caller SENDS it. Same two arms, no id — see the type above.
 *
 * 🚨 NARROWER THAN THE READ ON PURPOSE. `resourceType` is
 * {@link RoleResourceType} here rather than `string`, because the server refuses
 * anything outside that union naming every member of it — so a wider type here
 * would advertise a value the write cannot take. The read stays loose for the
 * opposite reason: a stored row may carry a retired kind.
 */
export type RoleTaskAssignmentInput =
  | { kind: "person"; userId: string }
  | { kind: "resource"; resourceType: RoleResourceType; resourceId: string };

/** One task as a caller SENDS it in the whole-list replace. */
export interface RoleTaskInput {
  /**
   * WHICH STORED ROW THIS IS, when it is one that already exists.
   *
   * 🚨 NAME A ROW TO KEEP IT. A task sent with its `id` is updated in place and
   * keeps it; one with no `id` is created; one the body omits is DELETED. Naming
   * it is what keeps the task's duty ticks alive — a re-minted id takes every
   * link row with it.
   *
   * ABSENT MEANS NEW, which is what every task in a first save is.
   */
  id?: string;
  /** What the work is called. Required and trimmed. */
  name: string;
  /** The one line under the name. `null` is "nobody wrote one", not `""`. */
  description: string | null;
  /** Occurrences a year. `null` is "not stated" and is NOT `0`. */
  occurrencesPerYear: number | null;
  /** People a year. `null` is "not stated" and is NOT `0`. */
  peoplePerYear: number | null;
  /** Revenue a year. `null` is "not stated" and is NOT `0`. */
  revenuePerYear: number | null;
  /** Who and what does it. An empty array is the ordinary state for a proposal. */
  assignments: RoleTaskAssignmentInput[];
}

/** The whole task list a replace sends. The array INDEX is the position. */
export interface RoleTasksBody {
  /** Every task the Role should have afterwards. Anything absent is deleted. */
  tasks: RoleTaskInput[];
}

/**
 * The duty ids a task ticks.
 *
 * 🚨 IDS ONLY, NEVER THE DUTY TEXT. Read the labels from
 * `listResponsibilities()` and zip on the id — both reads are required to render
 * a checklist. Ordered by the duty's own `position`.
 */
export interface RoleTaskDutiesResponse {
  /** The duty ids this task ticks, in the duties' own read order. */
  responsibilityIds: string[];
}

/** The whole set of duties a task ticks. */
export interface RoleTaskDutiesBody {
  /** Every duty this task should tick afterwards. The same id twice is refused. */
  responsibilityIds: string[];
}
