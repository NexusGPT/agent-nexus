import type {
  CoverageMoneyNotModelledReason,
  CoverageNotModelledReason,
  CoverageSavingsProjectionUnavailableReason
} from "@agent-nexus/sdk";

/** Every reason a Role has no coverage percentage at all. */
export const COVERAGE_NOT_MODELLED_REASONS: Record<CoverageNotModelledReason, true> = {
  NO_WORKLOAD_MODEL: true,
  NO_WORKING_TIME_MODEL: true,
  WORKING_TIME_MODEL_INVALID: true,
  WORKLOAD_MODEL_INVALID: true,
  WORKLOAD_WRONG_DIMENSION: true,
  WORKLOAD_ZERO_HOURS: true,
  WORKLOAD_NEGATIVE_HOURS: true,
  WORKLOAD_WRONG_PERIOD_BASIS: true,
  RATIO_NOT_FINITE: true
};

/** Every reason a Role has no money figures at all. */
export const COVERAGE_MONEY_NOT_MODELLED_REASONS: Record<CoverageMoneyNotModelledReason, true> = {
  NO_CURRENCY: true
};

/**
 * Every reason the saved hours cannot be re-expressed in money.
 *
 * 🚨 THE THIRD CLOSED VOCABULARY ON THIS ONE RESPONSE, and the help enumerated
 * the other two and stopped. `coverage` and `money` fail together in the common
 * case — an organization with no automation settings row answers
 * `NO_WORKING_TIME_MODEL` and `NO_CURRENCY` — so a caller who has cleared both
 * still meets `savingsProjection.kind: "unavailable"` on its own, over a
 * vocabulary neither of the other two names.
 *
 * 🚨 ONLY `NO_WORKLOAD_HOURS` IMPLIES THE PERCENTAGE IS ALSO ABSENT. The ratio
 * is hours over hours and reads neither a cost nor a currency, and
 * `RoleWorkload.costFormula` is nullable where `formula` is not — so a Role with
 * an authored workload and no cost model reports a real percentage beside an
 * unavailable projection. The other six arms are each reachable in that state,
 * which is why this list cannot be inferred from the two above it.
 */
export const COVERAGE_SAVINGS_PROJECTION_UNAVAILABLE_REASONS: Record<
  CoverageSavingsProjectionUnavailableReason,
  true
> = {
  NO_CURRENCY: true,
  NO_WORKLOAD_COST: true,
  NEGATIVE_WORKLOAD_COST: true,
  NO_WORKLOAD_HOURS: true,
  RATE_NOT_FINITE: true,
  AMOUNT_NOT_FINITE: true,
  IMPACT_HOURS_UNAVAILABLE: true
};
