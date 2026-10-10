import { AiTaskModelOverrideSchema, DbEnum, PROVIDER_TUNING_FIELDS } from "@nexus/types";

/**
 * WHICH PROVIDER-TUNING FIELDS A MODEL OVERRIDE ACTUALLY HAS, AND WHETHER THE
 * SCHEMA SUPPLIES ANY OF THEM WHEN A CALLER NAMES NONE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A CONFORMANCE MODULE AND NOT AN IMPORT AT THE CALL SITE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Two hand-written published `--help` strings enumerate these field names —
 * `commands/task/copy/execute-help.ts` and `commands/agent/create.help.ts` — and
 * one hand-written record keys on them, `commands/task/execute.command.ts`'s
 * `bodyOnly`. All three are prose and keys an operator reads, and all three sit
 * where the binary can reach them, so none of them may import `@nexus/types`:
 * `wire-types-bundle.test.ts` forbids it in EVERY file that is not a
 * `*.conformance.ts`, reachable or not, because the package pulls Zod and the
 * generated Prisma enums — the +5MB the CLI's standalone publishing model exists
 * to avoid. `ready-set-ceiling.conformance.ts` carries the same three walls.
 *
 * So the names stay hand-written where the binary can reach them, and the pin
 * lives HERE, where the real contract is legal to import and the binary is not.
 *
 * ── WHY A LIST THAT LOOKS STABLE NEEDS A PIN AT ALL ─────────────────────────
 *
 * {@link PROVIDER_TUNING_FIELDS} is derived BY EXCLUSION — it is whatever is
 * left of `ModelConfigBaseShape` after `modelName`, `modelProvider` and
 * `temperature`. So adding a dialect to that shape grows this set with no edit
 * anywhere, which is the safety property that module was written for, and it is
 * exactly what makes a hand-typed copy of the set rot in silence. Adding Kimi
 * missed four such copies; two reviewers found it and no test did.
 *
 * The published lists had already drifted when this module landed: both named
 * five of the six and omitted `reasoningLevel` — the one field the other four
 * are `@deprecated` in favour of writing.
 *
 * ── BEHAVIOURAL, NOT A READ OF ZOD'S INTERNALS ──────────────────────────────
 *
 * {@link overrideDeclaresField} asks the schema by PARSING, never by reading
 * `_def`: that is a private shape which moves between majors, and a pin that
 * breaks on a dependency bump gets deleted rather than investigated. `.shape` is
 * public, documented API and is used only to enumerate keys.
 *
 * ── WHAT THIS PINS, AND WHAT IT HONESTLY CANNOT ─────────────────────────────
 *
 * ✅ It pins the published field NAMES to the contract's own set, and it pins
 *    the one schema property the published sentence rests on: that an override
 *    naming no tuning field is parsed into an override that HOLDS no tuning
 *    field. A `.default()` landing on any of them would make "the call runs with
 *    none" false, and {@link tuningFieldsTheOverrideSchemaSupplies} is what reds.
 *
 * 🚨 IT CANNOT CHECK THE PROSE AROUND THOSE NAMES. "NOT inherited from the task"
 *    is `mergeModelConfig`'s behaviour, which lives in `apps/backend` and is not
 *    expressible in any schema — so no arm here can tell a correct sentence from
 *    a reworded wrong one. What it can do is refuse a published list of names
 *    that disagrees with the contract, which is the half that has actually
 *    drifted twice. Saying so is the point: a gate that implies coverage it
 *    lacks is how the next reader stops looking.
 */

/** Every provider-tuning field name, as the contract derives them. */
export const PROVIDER_TUNING_FIELD_NAMES: readonly string[] = [...PROVIDER_TUNING_FIELDS];

/** The minimum an override must carry — both halves of the routing pair. */
const ROUTING_ONLY: Readonly<Record<string, string>> = {
  modelName: "pinned-by-the-conformance-module",
  // Read off the contract rather than typed here, so a renamed provider cannot
  // make every probe below fail for a reason that has nothing to do with tuning.
  modelProvider: DbEnum.MODEL_PROVIDER_VALUES[0]
};

/**
 * A value no enum in this schema accepts, used to ask whether a key is VALIDATED.
 *
 * The schema strips unknown keys rather than refusing them, so junk on an
 * undeclared key parses clean while junk on a declared enum refuses. That
 * asymmetry is the whole probe, and it needs no per-field vocabulary — which is
 * what would otherwise have to be hand-copied here, re-creating the defect.
 */
const NOT_A_VALUE_ANY_ENUM_ACCEPTS = "__no-enum-accepts-this__";

/**
 * Does the override contract VALIDATE this key against a closed vocabulary?
 *
 * 🚨 THIS IS NOT "is the key declared", and the difference bit once: `modelName`
 * is `z.string()`, so the junk above is a PERFECTLY VALID value for it and this
 * probe answers `false` over a field the schema plainly declares. A positive
 * control therefore has to name a field with a closed vocabulary —
 * `modelProvider` or `customModelId` — and this probe may only be applied to a
 * population whose every member has one. Every provider-tuning field is a
 * `z.enum`, which is what makes {@link PROVIDER_TUNING_FIELD_NAMES} that
 * population.
 *
 * The residual failure is the safe one: loosening a tuning field to a bare
 * string makes this answer `false` and reds its caller, rather than passing
 * quietly over a field that stopped being checked.
 */
export function overrideValidatesField(field: string): boolean {
  return !AiTaskModelOverrideSchema.safeParse({
    ...ROUTING_ONLY,
    [field]: NOT_A_VALUE_ANY_ENUM_ACCEPTS
  }).success;
}

/** Every key the override contract declares. `.shape` is public Zod API. */
export const OVERRIDE_DECLARED_FIELDS: readonly string[] = Object.keys(
  AiTaskModelOverrideSchema.shape
);

/**
 * The provider-tuning fields an override naming NONE of them comes back
 * carrying.
 *
 * Empty is the only value that makes the published "or the call runs with none"
 * true. A `.default()` on any tuning field would put that field's name here.
 */
export function tuningFieldsTheOverrideSchemaSupplies(): readonly string[] {
  const parsed = AiTaskModelOverrideSchema.safeParse(ROUTING_ONLY);
  if (!parsed.success) {
    throw new Error(
      "the routing-only override this module probes with no longer parses, so every " +
        "answer below would be about a rejected input rather than about the tuning fields"
    );
  }
  const supplied: Record<string, unknown> = parsed.data;
  return PROVIDER_TUNING_FIELD_NAMES.filter((field) => supplied[field] !== undefined);
}
