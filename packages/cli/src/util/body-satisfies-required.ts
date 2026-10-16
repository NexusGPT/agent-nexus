/**
/**
 * A REQUIRED FIELD IS SATISFIED BY `--body`, NOT ONLY BY ITS FLAG.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS DELETES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Dozens of commands declare `--body <json>` alongside `requiredOption` flags
 * for the same fields, and their help documents a body-only invocation:
 *
 *   $ nexus agent create --body '{"firstName":"Ada","lastName":"Lovelace","role":"Assistant"}'
 *
 * That line could not run. Commander validates mandatory options in
 * `_parseCommand`, BEFORE the pre-action hooks and before the action handler —
 * so the command exited with
 *
 *   error: required option '--first-name <name>' not specified
 *
 * without reading a single byte of `--body`. The action itself was already
 * correct: it merges the body with the flags. The only thing standing between
 * the documented form and a working request was WHEN the check ran.
 *
 * ── THE FAMILY ──────────────────────────────────────────────────────────────
 *
 * This file is the PUBLIC NAME and declares nothing. Every importer in the
 * package names this path, and each leaf carries the section of the reasoning
 * it implements:
 *
 *  - `.population.ts` — why the participating commands are DERIVED from the
 *                       tree rather than listed, and the shape rule that does it.
 *  - `.field.ts`      — which body key satisfies a flag, declared before
 *                       inferred, and why two authorities disagreeing throws.
 *  - `.backfill.ts`   — why permitting the command is not the same as making it
 *                       work, and which values have a flag form at all.
 *  - `.message.ts`    — the error a genuinely missing field produces.
 *  - `.apply.ts`      — the three-step rewiring, the precedence rule, and the
 *                       stdin constraint that makes the memo load-bearing.
 *
 * No leaf imports this file back, so `import/no-cycle` has nothing to report.
 */

export { applyBodySatisfiesRequired } from "./body-satisfies-required.apply";
export { scalarAsFlagValue } from "./body-satisfies-required.backfill";
export {
  type BodyFieldSource,
  resolveBodyField,
  satisfiedByBodyField
} from "./body-satisfies-required.field";
export { missingFieldMessage } from "./body-satisfies-required.message";
export {
  type DeferredRequirement,
  findDeferredRequirements
} from "./body-satisfies-required.population";
