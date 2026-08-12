/**
 * The two statements that keep `nexus role`'s job-model help honest.
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
