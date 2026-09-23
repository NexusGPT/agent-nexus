import {
  COVERAGE_MONEY_NOT_MODELLED_REASONS,
  COVERAGE_NOT_MODELLED_REASONS,
  COVERAGE_SAVINGS_PROJECTION_UNAVAILABLE_REASONS
} from "./coverage-reason-vocabularies";
import { wrapMembers } from "./wrap-members";

/**
 * Appended to `nexus role coverage`.
 *
 * The reason names ARE the actionable part of the not-modelled arm, and every
 * sibling enum on this server already enumerates itself — `basis` answers
 * *"expected one of "SALARY"|"HOURLY"|…"*. This one field did not, so a caller
 * met a bare `NO_WORKING_TIME_MODEL` with no way to learn what else could come.
 */
export const COVERAGE_REASON_VOCABULARY = `
  THREE ARMS CARRY A CLOSED "reason", THEY NARROW SEPARATELY, and these are all
  of them.
  coverage.reason is one of:
${wrapMembers(Object.keys(COVERAGE_NOT_MODELLED_REASONS), "    ", 68)}
  money.reason is one of:
${wrapMembers(Object.keys(COVERAGE_MONEY_NOT_MODELLED_REASONS), "    ", 68)}
  savingsProjection.reason is one of:
${wrapMembers(Object.keys(COVERAGE_SAVINGS_PROJECTION_UNAVAILABLE_REASONS), "    ", 68)}

  NO_WORKLOAD_MODEL means this Role has no workload row. NO_WORKING_TIME_MODEL
  means the ORGANIZATION has no automation settings row, and NO_CURRENCY means
  it states no currency — both are org-wide rather than per Role, so they answer
  the same for every Role until "nexus role set-automation-settings" is run.
  Every other reason names a stored model that did not evaluate; the matching
  integrity.warnings entry carries the detail.

  THE PROJECTION IS A THIRD FIGURE AND FAILS ON ITS OWN. savingsProjection is
  the saved hours priced at ONE blended rate — the Role's labour cost divided by
  its worked hours — so it needs a labour cost that neither of the arms above
  reads. It answers "unavailable" with a percentage sitting beside it whenever
  nobody has costed the Role, and neither coverage.reason nor money.reason says
  why. Read its own reason.

  Two of its arms are DELIBERATELY COARSE and the detail is elsewhere:
  NO_WORKLOAD_COST covers "never authored" and "authored and does not evaluate"
  alike, and NO_WORKLOAD_HOURS is every reason coverage has no denominator —
  coverage.reason already names which. IMPACT_HOURS_UNAVAILABLE is ROW-LEVEL
  ONLY: each contributions[] row carries its own savingsProjection over this
  same vocabulary, and the Role-level figure sums those rows, so it can never
  answer that one.`;
