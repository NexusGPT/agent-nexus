/**
 * THE DIFF — the derived tree against the declared tables.
 *
 * The one place the derived POPULATION and the declared INTENT meet. An
 * unclassified leaf is a failure rather than a default, which is what stops a
 * new command being added silently.
 *
 * WHAT BELONGS HERE: `classifyCommandUniverse` and the drift helpers it is
 * built from. A new `DriftReport` field is filled here, in the same change that
 * declares it.
 *
 * WHAT DOES NOT: a declaration. Every table this reads lives in its own file,
 * and a literal added here would be a declaration nothing else can see — the
 * exact shape `scripts/id-thread-sweep.ts` moved `SWEEP_ROUTES_PENDING_DEPLOY`
 * out to avoid.
 */

import { SWEEP_ROUTES_PENDING_DEPLOY } from "../sweep-routes-pending-deploy";
import { COMMAND_CLASSIFICATION } from "./command-classification";
import { deriveCommandLeaves } from "./derive-projections";
import type { DriftReport } from "./drift-report";
import { SWEEP_EXPECTED_SKIPS } from "./sweep-expected-skips";

/**
 * Declared paths the sweep does not EXECUTE — drift, whichever declaration they
 * came from.
 *
 * ⚠️ ONE FUNCTION FOR BOTH DECLARATIONS, AND THE EQUIVALENCE IS WHY IT IS SAFE.
 * Each stale list was spelled `!observed.has(path) || the disposition is not
 * executable`. That is exactly `path ∉ safe`, because {@link DriftReport.safe} is
 * `observed` filtered to the executable dispositions — so set membership is the
 * same predicate with the two halves already combined, not a loosening of it.
 * Two copies of one idea is how the two lists start disagreeing about what drift
 * means.
 *
 * 🚨 ITS ARM IS NOT ITS OWN SPEC'S GREEN. A caller asserting `toEqual([])` over a
 * healthy tree is satisfied by this function returning `[]` for ANY reason —
 * including doing nothing at all — so a mutant that forces the answer empty
 * survives every such assertion. `sweep-declarations-report-drift.test.ts` is
 * what scores this, with a NON-EMPTY expected list, and the inverted-predicate
 * mutant is the one that proves the shipped callers are still watched.
 *
 * @param declaredPaths keys of a declaration — one of the `SWEEP_*` tables
 * @param sweptPaths the leaves the sweep executes, i.e. `DriftReport.safe`
 */
export function staleDeclarations(
  declaredPaths: readonly string[],
  sweptPaths: readonly string[]
): string[] {
  const swept = new Set(sweptPaths);
  return declaredPaths.filter((path) => !swept.has(path)).sort();
}

/** Diff the derived tree against the declared classification. */
export async function classifyCommandUniverse(): Promise<DriftReport> {
  const observed = await deriveCommandLeaves();
  const observedSet = new Set(observed);

  // `safe` is what the sweep RUNS, so both executable dispositions belong in it.
  // Filtering this to `"safe"` alone would silently stop sweeping every
  // fixture-backed leaf while `--check-drift` still reported them classified.
  //
  // Bound here rather than written inline four times: every list below is a
  // subset of it or a complement of it, and the repeated predicate was the one
  // place the two declarations could drift apart on what "the sweep executes"
  // means.
  const safe = observed.filter(
    (path) =>
      COMMAND_CLASSIFICATION[path] === "safe" ||
      COMMAND_CLASSIFICATION[path] === "safe-with-fixture"
  );

  return {
    observed,
    unclassified: observed.filter((path) => COMMAND_CLASSIFICATION[path] === undefined),
    stale: Object.keys(COMMAND_CLASSIFICATION)
      .filter((path) => !observedSet.has(path))
      .sort(),
    safe,
    fixtureBacked: observed.filter((path) => COMMAND_CLASSIFICATION[path] === "safe-with-fixture"),
    // Both subsets of `safe`, so a leaf can never carry an accepted skip or an
    // accepted absence without also being a leaf the sweep executes — or the
    // acceptance would apply to nothing.
    expectedSkips: safe.filter((path) => SWEEP_EXPECTED_SKIPS[path] !== undefined),
    staleExpectedSkips: staleDeclarations(Object.keys(SWEEP_EXPECTED_SKIPS), safe),
    pendingDeploy: safe
      .filter((path) => SWEEP_ROUTES_PENDING_DEPLOY[path] !== undefined)
      .map((path) => ({ path, ...SWEEP_ROUTES_PENDING_DEPLOY[path] })),
    stalePendingDeploy: staleDeclarations(Object.keys(SWEEP_ROUTES_PENDING_DEPLOY), safe)
  };
}
