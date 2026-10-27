import type {
  CoverageEvaluationFailure,
  CoverageFormula,
  CoverageIntegrity,
  CoverageMoneyTerm,
  CoverageRatio,
  CoverageSavingsProjection,
  ResolvedCoverageWorkingTime,
  RoleCoverageMoney,
  UnmodelledRoleSystem
} from "./role-coverage";

/**
 * Which bucket a system's figures land in.
 *
 * - `LIVE` — running, and the ONLY bucket summed into `impactPersonHours` and
 *   `money.totals`.
 * - `BUILDING` — being built. Its own row publishes what it WILL save; none of
 *   it is in the Role's totals, because nobody is saving it yet.
 * - `RETIRED` — no longer doing the Role's work. Same treatment as `BUILDING`.
 *
 * There is no `PROPOSED`: a `RoleResource` names a system that already exists,
 * so "a proposed system that exists" is a contradiction. The thing that is
 * proposed and names no system is a Role TASK.
 *
 * 🚨 IT SAYS NOTHING ABOUT `basis`. A live hand-estimated system is an estimate;
 * one still being built whose volumes were measured is measured. Going live
 * changes the bucket, never the basis.
 */
export type RoleResourceLifecycle = "BUILDING" | "LIVE" | "RETIRED";

/**
 * Whether a coverage figure rests on measurements, on estimates, or on both.
 *
 * 🚨 NOT the PERIOD basis. A coverage input's `perPeriod` states the WINDOW a
 * magnitude accumulates over; this states WHERE THE MAGNITUDE CAME FROM. The
 * two share a word and nothing else.
 *
 * - `ESTIMATED` — every magnitude behind the figure was typed by a person. Also
 *   the answer when nothing was evaluated at all, which is the arm that cannot
 *   overstate.
 * - `MIXED` — some measured, some not.
 * - `MEASURED` — every input the figure CONSUMED came from a measurement.
 *
 * It is all-or-nothing because a coverage model is a PRODUCT of its inputs: one
 * guessed factor is a factor of the answer, not a fraction of it. And it is a
 * claim about the MAGNITUDES only — a measurement replaces a number, never the
 * expression a person wrote around it, and never the organisation's stated
 * working day, week and year, which are reported separately on `workingTime`
 * with their own origin.
 *
 * It describes the COVERAGE model — the org's automation settings, the Role's
 * workload and one impact per held system. It says nothing about the job model
 * (`jobTypes`, `scopeLines`, `workingYear`), which shares this feature's
 * vocabulary and is evaluated elsewhere.
 */
export type CoverageBasis = "ESTIMATED" | "MIXED" | "MEASURED";

/** One system's contribution to the coverage numerator. */
export interface RoleCoverageContribution {
  /** The `RoleResource` row id — what every warning's `subject.id` refers to. */
  id: string;
  /** Which kind of system. A loose string, because a retired kind can appear. */
  resourceType: string;
  /** Which system. */
  resourceId: string;
  /**
   * Which bucket this row's figures land in, and therefore whether
   * `personHours` below is inside `RoleCoverage.impactPersonHours` or outside.
   *
   * 🚨 SUMMING `personHours` ACROSS THESE ROWS DOES NOT GIVE
   * `impactPersonHours`. Only `LIVE` rows are in the Role's totals. Read this
   * field, or read `impactPersonHoursByLifecycle`, which is the split already
   * done for you.
   */
  lifecycle: RoleResourceLifecycle;
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
  /**
   * What THIS ROW's figures rest on.
   *
   * Narrower than `measuredInputKeys` beside it: a model that evaluated and was
   * then refused appears there and not here, because it reached no figure.
   */
  basis: CoverageBasis;
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
  /**
   * The numerator: the sum of the contributions that evaluated AND are `LIVE`.
   *
   * 🚨 LIVE COVERAGE, NOT MODELLED COVERAGE. A system in `BUILDING` publishes a
   * real `personHours` on its own row and is deliberately absent from here — it
   * is work nobody is saving yet, and a headline that counted it would report a
   * saving the customer has not received.
   */
  impactPersonHours: number;
  /**
   * The numerator split by bucket — the source for "70% live, 4% more coming".
   *
   * Every bucket is always present; a zero here is a measurement, never a
   * missing key. `impactPersonHoursByLifecycle.LIVE === impactPersonHours`, by
   * construction.
   */
  impactPersonHoursByLifecycle: Record<RoleResourceLifecycle, number>;
  /** One entry per system that HAS an impact model. */
  contributions: readonly RoleCoverageContribution[];
  /** Every input key a measurement replaced, across every model evaluated. */
  measuredInputKeys: readonly string[];
  /** What this Role's published figures rest on. */
  basis: CoverageBasis;
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
