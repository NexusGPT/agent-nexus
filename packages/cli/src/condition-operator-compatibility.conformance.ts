import {
  CONDITION_OPERATORS,
  CONDITION_OPERATORS_BY_FIELD_TYPE,
  WorkflowDisplayType,
  type WorkflowDisplayTypeValue
} from "@nexus/types";

/**
 * WHICH `field.type` VALUES EACH BRANCHING OPERATOR IS MEANINGFUL ON — read off
 * `@nexus/types`, never written down here.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A CONFORMANCE MODULE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `wire-types-bundle.test.ts` allows exactly one kind of file to import
 * `@nexus/types`: a `*.conformance.ts`, none of which is reachable from
 * `src/index.ts`. The rule is deliberately stricter than reachability, because
 * `@nexus/types` pulls Zod and the generated Prisma enums and that is the +5MB
 * the CLI's standalone publishing model exists to avoid. This module obeys that
 * rule: it is a drift gate's data, it imports the real contracts, and the binary
 * cannot reach it.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
 *
 * `condition-operator-tables-agree-with-the-matrix.test.ts` holds two shipped
 * markdown tables against this. Both used to carry a row reading "all types",
 * and eight of the cells that row licensed answer a CONSTANT — measured by
 * executing the evaluator in
 * `condition-operator-matrix-agrees-with-the-evaluator.spec.ts`:
 *
 *   number x is_empty  -> NEVER      number x not_empty  -> ALWAYS
 *   boolean x is_empty -> NEVER      boolean x not_empty -> ALWAYS
 *   object x equals    -> NEVER      object x not_equals -> ALWAYS
 *   array x equals     -> NEVER      array x not_equals  -> ALWAYS
 *
 * 🚨 THE INVERSION IS COMPUTED, NOT TRANSCRIBED. `CONDITION_OPERATORS_BY_FIELD_TYPE`
 * is keyed by field type and both tables are keyed by operator, so something has
 * to turn one into the other. Writing that turn out by hand would make this
 * module a second copy of the very fact the gate exists to stop being copied,
 * and the gate would then be a change detector for its own transcription.
 */

/** Display types in declaration order, so a rendered list is stable. */
const DISPLAY_TYPES = Object.values(WorkflowDisplayType) as WorkflowDisplayTypeValue[];

/** The 19 accepted operator names, as strings, in `CONDITION_OPERATORS` order. */
export const CONDITION_OPERATOR_NAMES: readonly string[] = CONDITION_OPERATORS.map(
  (operator) => operator as string
);

/**
 * Operator -> the `field.type` values that offer it, in display-type order.
 * The inverse of `CONDITION_OPERATORS_BY_FIELD_TYPE`, so it cannot disagree
 * with it.
 */
export const FIELD_TYPES_BY_CONDITION_OPERATOR: ReadonlyMap<string, readonly string[]> = new Map(
  CONDITION_OPERATORS.map((operator) => [
    operator as string,
    DISPLAY_TYPES.filter((fieldType) =>
      CONDITION_OPERATORS_BY_FIELD_TYPE[fieldType].some((spec) => spec.operator === operator)
    ) as readonly string[]
  ])
);

/**
 * How many `(field type, operator)` pairs the matrix offers in total. A floor
 * for the gate: an emptied matrix must not let a document trivially agree with
 * nothing.
 */
export const OFFERED_CONDITION_PAIR_COUNT: number = [
  ...FIELD_TYPES_BY_CONDITION_OPERATOR.values()
].reduce((total, types) => total + types.length, 0);
