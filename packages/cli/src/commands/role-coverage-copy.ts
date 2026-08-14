/**
 * The statements that keep `nexus role`'s job-model help honest.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THESE ARE CONSTANTS AND NOT PROSE TYPED INTO EACH COMMAND
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A Role carries TWO cost models with overlapping vocabulary, and the help text
 * conflated them in five separate places. An API caller wrote every input the
 * public surface exposes on one Role, read them all back correctly, and the
 * coverage figure did not move by a digit — because none of what he wrote is an
 * input to it. The help had promised him an effect.
 *
 * ── THE TWO MODELS ───────────────────────────────────────────────────────────
 *
 * COVERAGE is derived on the SERVER from three rows and nothing else:
 * `RoleWorkload`, one `RoleSystemImpact` per held system, and
 * `OrganizationAutomationSettings`. Verified at source rather than assumed:
 * `GetRoleCoverageUseCase` injects exactly five ports — the Role existence
 * read, those three, and the held-resource list that produces
 * `unmodelledSystems` — and `RoleWorkingYear`, `RoleScopeLine` and `RoleJobType`
 * appear nowhere under `packages/types/src/shared/domain/role-coverage/`.
 *
 * THE JOB MODEL is the Scope, the job-type library, the Role's variables and its
 * working year. The server stores those rows and never reads them for coverage;
 * a browser evaluates them with a shunting-yard parser over infix strings, and
 * no endpoint returns its results.
 *
 * ── WHY ONE STRING RATHER THAN ONE SENTENCE PER COMMAND ──────────────────────
 *
 * Seven commands write the job model. Seven hand-written disclaimers is seven
 * chances to word one of them into a claim again, and the defect being cured is
 * exactly that — the same conflation, spelled differently, in five places. One
 * string means a correction lands everywhere at once, and
 * `role-coverage-help-is-true.test.ts` asserts every job-model write carries it
 * AND that the two commands which genuinely DO move coverage do not.
 *
 * ⚠️ THE TEST CANNOT TELL YOU THESE SENTENCES ARE TRUE. It pins WHERE they
 * appear. What they SAY is pinned by
 * `apps/backend/src/__governance__/role-coverage-inputs-are-the-documented-three.spec.ts`,
 * which derives the coverage input set from the use case and goes red naming
 * this file when that set moves.
 */

/**
 * Appended to every command that WRITES the job model.
 *
 * Written as an effect statement rather than a definition: the reader is
 * standing in front of a write and the question in their head is "what will
 * this change", so the answer has to be the first thing the paragraph says.
 */
export const JOB_MODEL_DOES_NOT_MOVE_COVERAGE = `
  THIS DOES NOT MOVE "nexus role coverage". The Scope, the job types, the
  variables and the working year are a SECOND cost model: the server stores
  them and never reads them for the coverage figure, which a browser evaluates
  instead. Write any of them and the coverage read answers exactly what it
  answered before, with no error and nothing saying so.
  Run "nexus role coverage --help" for the three inputs that do move it.`;

/**
 * Appended to `nexus role coverage`.
 *
 * The Notes block already there is correct and stays — it explains how to read
 * the discriminant and that the permission is necessary and not sufficient. It
 * is simply silent on which inputs produce the figure, which is the one thing
 * the reporter needed and the one thing no surface told him.
 *
 * The absence of the two writes is stated as a REFUSAL with its reason, not as
 * a gap. A caller who reads "not supported yet" retries next release; a caller
 * who reads why it will not be there goes to the dashboard.
 */
export const COVERAGE_INPUTS_NOTE = `
  THREE ROWS MOVE THIS FIGURE AND NOTHING ELSE DOES. The Role's WORKLOAD, which
  is the person-hours it works in a year and is the denominator. Each held
  system's IMPACT model, which is the person-hours that system gives back and
  is one term of the numerator. And the organization's AUTOMATION SETTINGS —
  hours a day, days a week, weeks a year, currency.

  ONLY THE LAST OF THE THREE IS WRITABLE THROUGH THIS API, with
  "nexus role set-automation-settings". The workload and the per-system impact
  are authored in the dashboard, on the Role's General tab. Their routes are
  absent from the public API deliberately and not by omission: they are the only
  writes that move a published labour-cost figure, and they are not shipped over
  a contract no client has ever sent.

  So the Scope, the job types, the variables and the working year do NOT move
  this figure. They are the second cost model, and they are evaluated in the
  browser.`;

/**
 * What `nexus role` prints in place of a working-year term nobody has stated.
 *
 * It read `(org default)` until 2026-08-14, on four fields and in two places,
 * and no organization default exists for any of them — see
 * {@link WORKING_YEAR_HAS_NO_ORGANIZATION_FALLBACK}. A constant rather than a
 * literal for the same reason the two statements above are constants: the wrong
 * word was in five places at once, and a correction has to land in all of them.
 */
export const NOT_STATED = "(not stated)";

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
