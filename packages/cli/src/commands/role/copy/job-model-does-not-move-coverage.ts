/**
 * Appended to every command that WRITES the job model — the one string seven
 * writing commands share, so a correction lands everywhere at once.
 *
 * ── THE TWO COST MODELS, WHICH IS WHY THIS FOLDER EXISTS ─────────────────────
 *
 * A Role carries TWO cost models with overlapping vocabulary, and the help text
 * conflated them in five separate places. An API caller wrote every input the
 * public surface exposes on one Role, read them all back correctly, and the
 * coverage figure did not move by a digit — because none of what he wrote is an
 * input to it. The help had promised him an effect.
 *
 * COVERAGE is derived on the SERVER from three MODELS: `RoleWorkload`, one
 * `RoleSystemImpact` per held system, and `OrganizationAutomationSettings`.
 * `RoleWorkingYear`, `RoleScopeLine` and `RoleJobType` appear nowhere under
 * `packages/types/src/shared/domain/role-coverage/`.
 *
 * THE JOB MODEL is the Scope, the job-type library, the Role's variables and its
 * working year. The server stores those rows and never reads them for coverage;
 * a browser evaluates them with a shunting-yard parser over infix strings, and
 * no endpoint returns its results.
 *
 * 🚨 A FOURTH THING MOVES THE FIGURE WITHOUT BEING A MODEL.
 * `RoleResource.lifecycle` decides whether a system's already-computed term
 * joins the totals at all — only `LIVE` is summed. It contributes no magnitude,
 * so the three models are unchanged, but a caller who moved a system to
 * BUILDING and watched the percentage drop is owed the sentence.
 *
 * ⚠️ NO TEST CAN TELL YOU THESE SENTENCES ARE TRUE. `role-coverage-help-is-true
 * .test.ts` pins WHERE they appear. What they SAY is pinned by
 * `apps/backend/src/__governance__/role-coverage-inputs-are-the-documented-three.spec.ts`,
 * which derives the coverage input set from the use case and goes red naming
 * this folder when that set moves.
 *
 * The port set is derived rather than counted: any number written here is wrong
 * by the next read anyone adds, and it was wrong already — it said five while
 * the use case injected eight.
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
