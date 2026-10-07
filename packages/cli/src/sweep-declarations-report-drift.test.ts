/**
 * A DECLARATION NAMING A LEAF THE SWEEP DOES NOT EXECUTE IS REPORTED — SCORED
 * AGAINST A NON-EMPTY EXPECTED LIST, WHICH IS THE WHOLE POINT OF THIS FILE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE ARM THIS REPLACES WAS VACUOUS, AND IT WAS GREEN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both sweep declarations are gated by a caller asserting the stale list is
 * empty:
 *
 *   expect(report.staleExpectedSkips).toEqual([]);
 *   expect(report.stalePendingDeploy).toEqual([]);
 *
 * Those are correct as GATES ON THE TREE — a healthy tree has no drift, and that
 * is what they are there to hold. They are worth nothing as evidence about the
 * DERIVATION, because on a healthy tree the right answer is `[]` and so is the
 * answer a derivation that does nothing at all would give. The two are
 * indistinguishable, in both directions, forever.
 *
 * 🔴 MEASURED, not reasoned. One mutant forcing `stalePendingDeploy` to `[]`:
 *
 *   | arm                                              | pristine | mutant |
 *   |--------------------------------------------------|----------|--------|
 *   | `expect(report.stalePendingDeploy).toEqual([])`   | green    | GREEN  |
 *   | the arms below, over a NON-EMPTY expected list    | green    | RED    |
 *
 * The first row is the unfloored-sweep-of-an-empty-population form: an assertion
 * over a population that is empty anyway, which would read identically if the
 * code beneath it were deleted. A survivor there is the ARM's fault and not the
 * mutant's, and the cure is not a tighter assertion on the empty case — it is a
 * population that is not empty.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A FIXTURE RATHER THAN THE SHIPPED DECLARATION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The shipped tables must have no drift, so they cannot supply a non-empty
 * expectation without the tree being broken. {@link staleDeclarations} is pure
 * and takes both populations as arguments for exactly this reason: the drift it
 * is asked to find is handed to it here, and the expected answer names the leaf.
 *
 * ⚠️ IT IS THE SHIPPING FUNCTION, IMPORTED — never a re-implementation of the
 * predicate in this file. A spec that exercises a local replica of its subject is
 * honest, runs, reaches its branch and holds no claim whatever about the real
 * thing, and it drifts in silence in both directions.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It does not assert that the SHIPPED declarations are drift-free. Those arms stay
 * with the mechanisms that own them — `sweep-skips-only-a-declared-opt-out.test.ts`
 * for the skips, `sweep-routes-pending-deploy-self-retire.test.ts` for the
 * absences — because each also asserts the things only that mechanism knows. This
 * file owns the function's CONTRACT; those own their table.
 */
import { describe, expect, it } from "vitest";

import { staleDeclarations } from "./command-universe";

describe("staleDeclarations reports a declaration the sweep does not execute", () => {
  it("names a declared path that is NOT swept", () => {
    // 🔴 THE ARM. The expected list is NON-EMPTY, so a derivation that returns
    // `[]` for any reason — including not running — fails here. Every assertion
    // in the shipped callers is satisfied by exactly that `[]`.
    expect(staleDeclarations(["b list"], ["a list"])).toEqual(["b list"]);
  });

  it("says nothing about a declared path that IS swept", () => {
    // The other direction, and it needs its own case: a function that returned
    // its whole input would satisfy the arm above and nothing else.
    expect(staleDeclarations(["a list"], ["a list"])).toEqual([]);
  });

  it("separates the two in one call rather than answering all-or-nothing", () => {
    // A mutant that reports every declaration, or none, passes one of the two
    // arms above. Neither passes this.
    expect(staleDeclarations(["b list", "a list", "c list"], ["a list", "c list"])).toEqual([
      "b list"
    ]);
  });

  it("is SORTED, because two callers render it and a set has no order", () => {
    expect(staleDeclarations(["z list", "a list", "m list"], [])).toEqual([
      "a list",
      "m list",
      "z list"
    ]);
  });

  it("treats an UNSWEPT path and an UNKNOWN path as one answer", () => {
    // The predicate this replaced had two halves — the leaf is absent from the
    // tree, OR its disposition is not executable — and collapsed them into one
    // verdict. Membership in the swept set is that collapse: a leaf the sweep
    // does not run is drift whichever of the two it is, because the declaration
    // applies to nothing either way.
    expect(staleDeclarations(["renamed away", "registration-only leaf"], ["a list"])).toEqual([
      "registration-only leaf",
      "renamed away"
    ]);
  });

  it("holds on an EMPTY declaration, which is the ordinary state of a clean branch", () => {
    // Not a vacuity arm — it is the state a branch that declares nothing is in,
    // and the callers must not report drift for it.
    expect(staleDeclarations([], ["a list"])).toEqual([]);
  });
});
