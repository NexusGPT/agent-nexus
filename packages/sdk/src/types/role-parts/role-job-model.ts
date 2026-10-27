import type { RoleResourceLifecycle } from "./role-coverage-money";
import type {
  RoleJobType,
  RoleJobTypeBasis,
  RoleJobTypeGroup,
  RoleJobTypePart
} from "./role-writes";

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
  /**
   * Weeks actually worked — `calendarWeeks` less the leave, the holidays and
   * the sickness, floored at one week.
   *
   * DERIVED on every read, never stored, so it cannot disagree with the four
   * terms beside it. `null` means this Role has not stated `calendarWeeks`,
   * which is the term the other three are subtracted FROM — not an error, and
   * not a zero. Holidays and sickness are days and convert at five days to the
   * week.
   */
  weeksWorked: number | null;
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

/**
 * Request body for `client.roles.transitionSystemLifecycle()`.
 *
 * 🚨 THIS MOVES THE ROLE'S PUBLISHED COVERAGE IN BOTH DIRECTIONS AND THE RESULT
 * REPORTS NEITHER. Only `LIVE` systems are summed, so moving one INTO `LIVE`
 * adds its person-hours, revenue and cost to the Role's totals, and moving one
 * OUT of `LIVE` removes all three — without touching a single model. The system
 * keeps publishing its own per-row figures either way, so the per-system rows
 * look unchanged while the headline number has moved. `roles.coverage(roleId)`
 * is the read that says by how much, and it needs `role_coverage:read` — a scope
 * this write neither carries nor implies.
 *
 * 🔴 `LIVE` IS REACHABLE ONLY FROM `BUILDING`. `RETIRED -> LIVE` is refused, and
 * so is asking for the state the system is already in. Un-retiring is `RETIRED`
 * then `BUILDING` then `LIVE`, one extra call. The rule exists so that every
 * approval has a submitter to be checked against: the only thing that records a
 * submitter is the move INTO `BUILDING`, so a direct edge would create rows
 * going live with no submitter or a stale one, and the Role's review requirement
 * would have to fail open or fail closed for exactly those rows.
 */
export interface RoleSystemLifecycleBody {
  /** The bucket to move the system into. */
  lifecycle: RoleResourceLifecycle;
}

/**
 * What the transition did.
 *
 * Echoes the state rather than a bare success, so a caller that retried after a
 * timeout can tell which state it is looking at without a second round trip. It
 * deliberately carries no coverage figure: a payload with a stale numerator in it
 * invites a re-render from the wrong number.
 */
export interface RoleSystemLifecycleResult {
  /** The `RoleResource` attachment that moved — not the system's own id. */
  roleResourceId: string;
  /** The bucket it is now in. */
  lifecycle: RoleResourceLifecycle;
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
