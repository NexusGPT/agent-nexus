/**
 * Appended to `nexus role working-year` and `nexus role set-working-year`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS REPLACES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both commands told the reader that a blank term falls back to "the
 * organization's value", and printed `(org default)` for every `null` they read
 * back. **No organization value exists for any of the four terms, in any
 * organization, and none ever has.** The two rows hold disjoint quantities:
 *
 *   `RoleWorkingYear`                 calendarWeeks, paidLeaveWeeks,
 *                                     publicHolidayDays, sicknessDays
 *   `OrganizationAutomationSettings`  hoursPerDay, daysPerWeek,
 *                                     workingWeeksPerYear, currency
 *
 * The domain says so where the row is defined — *"All four nullable, and `null`
 * is 'not stated' — a named answer rather than a number to substitute"* — and
 * so does the v1 endpoint description. The CLI was the one surface that
 * disagreed, and it disagreed on the channel a caller actually reads.
 *
 * ── WHY THIS IS THE SAME DEFECT AS THE TWO STATEMENTS ABOVE ──────────────────
 *
 * That pass asked "does this help claim a coverage EFFECT the server does not
 * have". This one is the sibling question it did not ask: "does this help name
 * a VALUE that does not exist". Same command, same file, same reader, and the
 * sentence survived the pass that was cleaning the paragraph beside it.
 *
 * 🚨 THE FIX IS NOT THE WORDS. `role-help-offers-no-absent-fallback.test.ts`
 * DERIVES both field sets from `@nexus/types` and goes red the day they
 * intersect — the day an organization CAN hold one of these terms, which is the
 * only day this sentence becomes false. Until then it cannot rot.
 */
export const WORKING_YEAR_HAS_NO_ORGANIZATION_FALLBACK = `
  A BLANK TERM MEANS NOT STATED. It does not mean zero, and it does not fall
  back to anything: no organization setting holds a calendar year, paid leave,
  public holidays or sickness, so there is nothing for it to fall back TO.
  "nexus role set-automation-settings" holds hours a day, days a week, weeks a
  year and the currency — four different quantities.`;
