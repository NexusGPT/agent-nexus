import type { RoleResourceLifecycle } from "./role-coverage-money";

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
  /**
   * Which bucket it is in, even with no figure to bucket.
   *
   * A system can be `BUILDING` and unmodelled at once — the ordinary state of
   * something somebody has just started — so a count of "what is being built"
   * taken from `contributions` alone undercounts by exactly these.
   */
  lifecycle: RoleResourceLifecycle;
  /** Why it produced no contribution. */
  reason: "NO_IMPACT_MODEL";
}
