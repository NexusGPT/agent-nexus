import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { shrinkOnlyLedger } from "@nexus/types/testing/shrink-only-ledger";
import { describe, expect, it } from "vitest";

import { deriveIdGraph } from "./id-graph";
import { ID_GRAPH_UNCOVERED } from "./id-graph.uncovered.generated";

/**
 * THE RATCHET. Coverage may improve without ceremony and may not decay quietly.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS GOES THROUGH `shrinkOnlyLedger` RATHER THAN A HAND-ROLLED SWEEP
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This file WAS hand-rolled, and it carried two of the exact shapes that helper
 * exists to make unwritable:
 *
 *   · `expect(ID_GRAPH_UNCOVERED.length).toBeGreaterThan(0)` — an anti-vacuity
 *     control that DIES ON SUCCESS. The day the last unreachable leaf is bound,
 *     the ledger empties and this gate fails, so the person finishing the
 *     cleanup deletes the gate. The control has to sit on a population that
 *     SURVIVES the cure, which is why {@link drainProof} below is the leaves
 *     that take an id rather than the ones that cannot be reached.
 *   · a STALENESS ARM — "a ledger row naming a leaf that is no longer uncovered
 *     must be deleted". That is a lower bound on draining data: it reds the
 *     build on the very act of landing a `bindCommand`, until the ledger is
 *     regenerated in the same edit. Every parallel drain became a conflict with
 *     a red attached. A row left behind after a cure is harmless residue and is
 *     now allowed to sit there; the ceiling is what stops the class growing.
 *
 * The cost of dropping the staleness arm, stated rather than discovered: a leaf
 * that is cured and later goes uncovered again is re-admitted silently, because
 * its row never left. That is a real hole and it is the cheaper of the two — the
 * arm that closed it refused correct work every time anybody fixed anything.
 */

/** The ledger's keys, in the order it holds them. */
const LEDGER_KEYS = ID_GRAPH_UNCOVERED.map(([path]) => path);

/** `path -> why`, for the row check below. */
const LEDGER_REASONS = new Map<string, string>(ID_GRAPH_UNCOVERED);

/** Every reason the derivation can produce. A row naming anything else is malformed. */
const KNOWN_REASONS = new Set([
  "unbound-no-provable-method",
  "bound-but-mutates",
  "positional-not-a-path-param",
  "requires-an-option-we-cannot-supply",
  "declared-unsweepable"
]);

const graph = deriveIdGraph();

/**
 * The population that does NOT empty when this class is cured.
 *
 * Every leaf taking a required id stays in it whether or not it is reachable —
 * curing one moves it OUT of the findings and it remains here. A floor on this
 * cannot be tripped by fixing anything, which is exactly what a floor on the
 * ledger could.
 */
const drainProof = {
  name: "leaves that take at least one required id",
  keys: [...graph.threadable.map((leaf) => leaf.path), ...graph.excluded.map((leaf) => leaf.path)]
};

const gate = shrinkOnlyLedger({
  population: "leaves that take a required id and cannot be reached by the id-thread sweep",
  findings: graph.excluded,
  keyOf: (leaf) => leaf.path,
  ledgerKeys: LEDGER_KEYS,
  // 🚨 A LITERAL, EQUAL TO THE LEDGER IT BOUNDS — never `LEDGER_KEYS.length`,
  // which would bound the ledger by itself and permit unlimited growth in
  // silence. Raising it is the one edit that lets this class grow, and it
  // cannot be made without being seen.
  //
  // 338 -> 339 for `tracks task why-not-ready`, and the binding remedy is
  // genuinely unavailable to it rather than merely unwritten: it COMPOSES three
  // reads (ready set, plan, edges) and maps to no single route, so there is no
  // contract to bind it to and `bindCommand` could only name one of the three.
  // Its own docblock in `commands/tracks.ts` states that as a deliberate design
  // decision, made before this gate existed. It is not `declared-unsweepable`
  // either — it is perfectly callable given a real trackId, so a
  // `id-graph.leaf-residue.ts` row would claim something false about it.
  //
  // 339 -> 340 for `role set-system-lifecycle`, classified `bound-but-mutates`.
  // It IS bound — `bindCommand` names `RolesTransitionSystemLifecycle`, so the
  // remedy the other rows lack is already applied — and it stays unsweepable for
  // the reason that classification exists: the sweep calls what it reaches, and
  // this call moves a Role's published coverage figure. There is no read-only
  // form of it to call instead. A row here is the honest place for that, not a
  // `declared-unsweepable` entry, which would claim it cannot be reached.
  ceiling: 340,
  remedy:
    "Add a `bindCommand(...)` call to the leaf so its HTTP method is provable, or declare it " +
    "in `id-graph.leaf-residue.ts` with the refusal verbatim. Regenerating the ledger " +
    "(`pnpm --filter @agent-nexus/cli run gen:id-graph-ledger`) writes the gap in permanently " +
    "and is NOT the fix.",
  drainProofControl: drainProof,
  rowCheck: {
    name: "names a reason the derivation can actually produce",
    offender: (key) => {
      const reason = LEDGER_REASONS.get(key);
      return reason !== undefined && KNOWN_REASONS.has(reason)
        ? null
        : `${key} -> ${String(reason)}`;
    }
  }
});

describe("the uncovered ledger", () => {
  // `gate.checks` is the GATE's OWN checks, not the ledger — it is derived by
  // `shrinkOnlyLedger` and documented never-empty, so driving `.each` over it is
  // safe at any ledger size in a way the ledger itself is not.
  //
  // 🚨 IT IS STILL WRAPPED, and the wrapper is not belt-and-braces. An empty
  // table here would register ZERO tests and report the file PASSED, and
  // "never empty" is a promise made by a function in another package rather
  // than something this file can see. `eachOrRefuse` is the right wrapper
  // precisely because this population is DERIVED: if it ever empties, the
  // helper broke, which is the case it exists to refuse. The ledger sweeps
  // below use an offender array instead, because THEIR empty state is success.
  it.each(eachOrRefuse(gate.checks, "the shrink-only ledger gate's own checks"))(
    "$name",
    ({ actual, expected, message }) => {
      expect(actual, message).toEqual(expected);
    }
  );

  /**
   * The ledger must agree with the derivation about WHY each leaf is uncovered.
   *
   * One `it` collecting offenders, never `.each` over the ledger: an empty
   * ledger is the SUCCESS state here, and an empty `.each` table fails
   * collection in jest and registers zero tests in vitest.
   */
  it("agrees with the derivation about why each leaf is uncovered", () => {
    const disagreements = graph.excluded
      .filter((leaf) => LEDGER_REASONS.has(leaf.path) && LEDGER_REASONS.get(leaf.path) !== leaf.why)
      .map(
        (leaf) =>
          `${leaf.path}: ledger says ${String(LEDGER_REASONS.get(leaf.path))}, derivation says ${leaf.why}`
      );

    expect(disagreements, "Regenerate the ledger once the change is what you meant.").toEqual([]);
  });
});
