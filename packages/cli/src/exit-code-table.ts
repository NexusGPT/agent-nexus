import type { ExitCategory } from "./exit-code-categories";

/**
 * The taxonomy. THE ONLY PLACE AN EXIT CODE IS WRITTEN AS A NUMBER.
 *
 * `exit-code-taxonomy.test.ts` scans the package for integer exit literals
 * outside this declaration and fails naming each one, so a call site that
 * invents a number is a red build rather than a review finding.
 *
 * ── WHY THE DECLARATION IS A LEAF ───────────────────────────────────────────
 *
 * Everything in this package reads these numbers, and four modules beside it
 * read them to do their own job — the HTTP rule, the carrier error, the
 * self-audit and the index. Were the map declared in `exit-codes.ts`, which
 * re-exports those four, each of them would import the module that re-exports
 * it and `import/no-cycle` would refuse all four. So the map sits here, with
 * nothing but the category vocabulary above it, and `exit-codes.ts` is the
 * index every caller actually names.
 */
export const EXIT_CODES = {
  success: 0,
  failed: 1,
  "not-authenticated": 2,
  "permission-denied": 3,
  "not-found": 4,
  "invalid-input": 5,
  "remote-error": 6,
  "connection-failed": 7,
  "timed-out": 8,
  "local-failed": 9,
  "outcome-not-reached": 10,
  unmeasured: 11,
  interrupted: 130
} as const satisfies Readonly<Record<ExitCategory, number>>;

/** Every category name, for a gate that must enumerate rather than count. */
export const EXIT_CATEGORIES = Object.keys(EXIT_CODES) as readonly ExitCategory[];

/** The declared codes, as a set, for membership checks. */
const DECLARED_CODES: ReadonlySet<number> = new Set(Object.values(EXIT_CODES));

/** Is `code` a member of the taxonomy? The gate's core question. */
export function isDeclaredExitCode(code: number): boolean {
  return DECLARED_CODES.has(code);
}

/** The category a declared code names, or `null` when the code is undeclared. */
export function exitCategoryFor(code: number): ExitCategory | null {
  for (const category of EXIT_CATEGORIES) {
    if (EXIT_CODES[category] === code) return category;
  }
  return null;
}
