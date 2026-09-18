import { describe, expect, it } from "vitest";

import type { DeepOmit, DeepOmitAll } from "./deep-omit";
import type { Equals, Expect } from "./v1-contract-equality";

/**
 * The per-path controls {@link DeepOmit} owes before any ledger row is narrowed
 * with it.
 *
 * `types/v1-response-types-match-the-contract.test.ts` refused a deep by-path
 * erase for one stated reason: its failure mode is a VACUOUS assertion rather
 * than a red one. A narrowing that erases more than it names compares equal for
 * reasons that have nothing to do with the contract, and reads as coverage
 * while gating nothing. So the question every arm below answers is not "does
 * the erase work" but "does it erase EXACTLY what it named".
 *
 * ## These arms are checked by `tsc`, and that is a property worth naming
 *
 * Vitest transpiles per file and never runs the project's type graph, so the
 * `Expect<Equals<…>>` tuples are enforced by the `Typecheck` job alone — the
 * same arrangement as every other gate in this package. It has one advantage
 * over a runtime arm and it is the reason the arms are written this way:
 * **`tsc` reports every failing line, where a throwing `expect` aborts the rest
 * of its own `it`.** A mutant that breaks four of these properties names four
 * lines, so no arm here can be scored by another arm's failure.
 *
 * The runtime block at the bottom is the control that this FILE is reached at
 * all — a spec nobody runs is in the same state as one nobody mutated.
 */

// ---------------------------------------------------------------------------
// It erases the path it names
// ---------------------------------------------------------------------------

/** The shape most ledger reasons have: one bad field beside good siblings. */
interface Nested {
  a: { b: string; c: number };
  z: boolean;
}

export type ErasesTheNamedPath = [
  // The named leaf goes, both siblings stay — `c` beside it and `z` above it.
  Expect<Equals<DeepOmit<Nested, "a.b">, { a: { c: number }; z: boolean }>>,
  // A single-segment path is a plain top-level erase, which is what the five
  // `Tool*` narrowings need and what the `Except` helper used to do alone.
  Expect<Equals<DeepOmit<Nested, "z">, { a: { b: string; c: number } }>>
];

// ---------------------------------------------------------------------------
// It erases by PATH, never by NAME
// ---------------------------------------------------------------------------

/**
 * The same key spelled at two depths. Erasing `a.b` must not touch `b`.
 *
 * `keep` is here so the inner object does not empty out: an erase down to `{}`
 * would make the arm turn on how an empty object type is spelled rather than on
 * which `b` was removed, which is not what it is asking.
 */
interface Shadowed {
  b: string;
  a: { b: number; keep: boolean };
}

export type ErasesByPathNotByName = [
  Expect<Equals<DeepOmit<Shadowed, "a.b">, { b: string; a: { keep: boolean } }>>
];

// ---------------------------------------------------------------------------
// It preserves the modifiers a homomorphic map is supposed to preserve
// ---------------------------------------------------------------------------

export type PreservesOptionality = [
  Expect<Equals<DeepOmit<{ a?: { b: string; c: number } }, "a.b">, { a?: { c: number } }>>
];

export type PreservesReadonly = [
  Expect<
    Equals<DeepOmit<{ readonly a: { b: string; c: number } }, "a.b">, { readonly a: { c: number } }>
  >
];

// ---------------------------------------------------------------------------
// Arrays, at the root and nested
// ---------------------------------------------------------------------------

export type TraversesArrays = [
  // A nested array: `providers[].slug` is this shape in the real ledger.
  Expect<Equals<DeepOmit<{ a: { b: string; c: number }[] }, "a.b">, { a: { c: number }[] }>>,
  // A ROOT array: several v1 routes return a bare array, so the element type is
  // what a single-segment path has to reach.
  Expect<Equals<DeepOmit<{ b: string; c: number }[], "b">, { c: number }[]>>
];

// ---------------------------------------------------------------------------
// Unions survive, including the `| null` half of a nullable field
// ---------------------------------------------------------------------------

export type PreservesUnions = [
  Expect<
    Equals<DeepOmit<{ a: { b: string; c: number } | null }, "a.b">, { a: { c: number } | null }>
  >
];

// ---------------------------------------------------------------------------
// An unresolvable path erases NOTHING — the safe direction
// ---------------------------------------------------------------------------

/**
 * Each of these is a way to get a path wrong, and each must leave the type
 * exactly as it was so the drift it was meant to exempt stays in the
 * comparison and the assertion goes red. A `DeepOmit` that quietly erased
 * something here would turn a typo into a silent hole.
 */
export type UnresolvablePathIsANoOp = [
  // First segment is not a key at all.
  Expect<Equals<DeepOmit<Nested, "nope.b">, Nested>>,
  // Final segment is not a key of the object the path reached.
  Expect<Equals<DeepOmit<Nested, "a.nope">, Nested>>,
  // The path runs into a primitive and cannot continue.
  Expect<Equals<DeepOmit<{ a: string }, "a.b">, { a: string }>>
];

// ---------------------------------------------------------------------------
// THE VACUITY CONTROL — the arm that makes every arm above worth reading
// ---------------------------------------------------------------------------

/**
 * A by-path erase that collapsed its operands would satisfy every positive arm
 * above by comparing nothing, which is exactly the failure the host file
 * refused this machinery for.
 *
 * The pair is one mutant apart and must land on opposite sides:
 *
 * - erase the field that DIFFERS and the two types become equal — the feature;
 * - erase a field and a SIBLING difference must survive — the safety property.
 *
 * Together they say the erase reaches the named path and stops there.
 */
export type DoesNotCollapseItsOperands = [
  // The ledgered field's difference is genuinely gone once erased.
  Expect<
    Equals<
      Equals<DeepOmit<{ a: { b: string } }, "a.b">, DeepOmit<{ a: { b: number } }, "a.b">>,
      true
    >
  >,
  // A difference in an UNNAMED sibling survives the erase, so a narrowed row
  // still reds on the drift it did not exempt. This is the whole point.
  Expect<
    Equals<
      Equals<
        DeepOmit<{ a: { b: string; c: number } }, "a.b">,
        DeepOmit<{ a: { b: string; c: string } }, "a.b">
      >,
      false
    >
  >,
  // The same, one level up: a top-level sibling difference is not erased by a
  // nested path.
  Expect<
    Equals<
      Equals<
        DeepOmit<{ a: { b: string }; z: number }, "a.b">,
        DeepOmit<{ a: { b: string }; z: string }, "a.b">
      >,
      false
    >
  >
];

// ---------------------------------------------------------------------------
// DeepOmitAll folds, and an empty list is identity
// ---------------------------------------------------------------------------

export type ErasesEveryPathGiven = [
  Expect<Equals<DeepOmitAll<Nested, ["a.b", "z"]>, { a: { c: number } }>>,
  // Order does not change the result.
  Expect<Equals<DeepOmitAll<Nested, ["z", "a.b"]>, { a: { c: number } }>>,
  // Two paths sharing a prefix: the second recurses into the rewritten branch.
  Expect<
    Equals<
      DeepOmitAll<{ a: { b: string; c: number; d: boolean } }, ["a.b", "a.c"]>,
      { a: { d: boolean } }
    >
  >,
  // An empty list erases nothing, so a row that names no path narrows nothing
  // rather than narrowing everything.
  Expect<Equals<DeepOmitAll<Nested, []>, Nested>>
];

describe("DeepOmit", () => {
  /**
   * The control that this file is REACHED. Every assertion above is a type and
   * is invisible to this runner; if the module were unresolvable or the suite
   * never collected, the arms would report nothing rather than failing.
   */
  it("is enforced by typecheck, and this file is where a DeepOmit defect surfaces", () => {
    expect(true).toBe(true);
  });
});
