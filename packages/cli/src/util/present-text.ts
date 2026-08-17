/**
 * Blank-aware fallbacks — the CLI's own copy, and the copy is deliberate.
 *
 * `??` fires on `null` and `undefined` only. `""` is neither, so
 * `label ?? "unknown"` hands back the empty string and the fallback beside it is
 * unreachable. Every caller in this package wants the fallback when the value is
 * ABSENT *or* BLANK, because every one of them is rendering to a terminal where
 * an empty cell says nothing.
 *
 * ── WHY THIS IS NOT IMPORTED FROM `@nexus/types` ──────────────────────────────
 *
 * `@nexus/types` owns `firstNonBlankOr` and `asNonBlankText`, and the CLI cannot
 * reach them. It publishes as a standalone npm package with tsup's
 * `skipNodeModulesBundle: true`, and `@nexus/types` is a devDependency — so an
 * import here would emit a literal CommonJS require for that package into
 * `dist/`, in a package whose `dependencies` do not contain it. It would
 * install fine and throw on first run.
 *
 * 🚨 The require call is DESCRIBED rather than written out, and that is not
 * squeamishness. `src/wire-types-bundle.test.ts` greps every file under `src/`
 * for an import of that package and allows it only in a `*.conformance.ts`
 * module — a TEXT match, deliberately, because a reachability walk would have
 * to model re-exports, dynamic imports and `import type` elision and would
 * under-report at each one. Spelling the call here turns this comment into a
 * violation of the rule it is explaining.
 *
 * That is this package's standing rule, not a workaround for it.
 * `src/admin-wire-types.ts` states it for the same reason: "The CLI publishes as
 * a standalone npm package, so `@nexus/types` cannot be a runtime dependency: it
 * pulls Zod and, transitively, the generated Prisma enums."
 *
 * 🚨 So do NOT "tidy" this away by importing the shared helper. The two copies
 * are allowed to exist; a runtime dependency on `@nexus/types` is not.
 */

/** A value is PRESENT when it is a string with at least one non-whitespace character. */
function isPresent(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The first PRESENT candidate, or the fallback.
 *
 * The blank-skipping equivalent of `a ?? b ?? fallback`. Candidates are accepted
 * as `unknown` so a value off a JSON response can be passed without a cast — a
 * non-string is simply not present.
 */
export function firstNonBlankOr(candidates: readonly unknown[], fallback: string): string {
  for (const candidate of candidates) {
    if (isPresent(candidate)) return candidate;
  }
  return fallback;
}

/** One candidate. `firstNonBlankOr([value], fallback)` with less noise at the call site. */
export function nonBlankOr(value: unknown, fallback: string): string {
  return isPresent(value) ? value : fallback;
}
