import { leafResidueFor } from "./id-graph.leaf-residue";
import type { ExcludedLeaf } from "./id-graph.model";
import { routeParams } from "./id-graph.route-params";
import type { RawLeaf } from "./id-graph.walk";

/**
 * WHETHER A LEAF THAT TAKES AN ID MAY ENTER THE POPULATION AT ALL.
 *
 * Five refusals, in the order below, and the ORDER is part of the contract:
 * each one is only askable once the ones above it have passed. `id-graph.ts`
 * owns why the population is proven rather than guessed; `ExcludedLeaf.why` in
 * `id-graph.model.ts` carries the full reasoning for each arm, including the
 * vacuous green the last one was written to close.
 */

/**
 * The verdict on one leaf, carrying what the caller needs rather than making it
 * re-derive it.
 *
 * The admitted arm names `route` and `params` because proving admission is what
 * establishes they exist — a caller reaching back into `leaf.route` would need
 * a cast to say what this function already knows.
 */
export type LeafAdmission =
  | {
      readonly admitted: true;
      /** Proven present. Always a `GET` route. */
      readonly route: string;
      /** Its `:param` names, in route order, which is also argv order. */
      readonly params: readonly string[];
    }
  | { readonly admitted: false; readonly excluded: ExcludedLeaf };

/** Admit one `registration-only` leaf that takes at least one required positional. */
export function admitLeaf(leaf: RawLeaf): LeafAdmission {
  if (leaf.method === undefined || leaf.route === undefined) {
    return { admitted: false, excluded: { path: leaf.path, why: "unbound-no-provable-method" } };
  }
  if (leaf.method !== "GET") {
    return {
      admitted: false,
      excluded: { path: leaf.path, why: "bound-but-mutates", method: leaf.method }
    };
  }

  // A requirement no derivation can see. Measured against live staging and
  // declared, because the alternative is a false FAILED on a healthy route.
  if (leafResidueFor(leaf.path) !== undefined) {
    return { admitted: false, excluded: { path: leaf.path, why: "declared-unsweepable" } };
  }

  // 🚨 EVERY REQUIRED INPUT, NOT JUST THE POSITIONAL ONES. The harness passes
  // positionals and `--json`; a `.requiredOption()` is an input it cannot fill,
  // so admitting the leaf would test the CLI's own refusal rather than the
  // route. Five leaves reported FAILED on live staging this way before the
  // check existed, every one of them healthy.
  if (leaf.mandatoryOptions.length > 0) {
    return {
      admitted: false,
      excluded: {
        path: leaf.path,
        why: "requires-an-option-we-cannot-supply",
        unsatisfiable: leaf.mandatoryOptions
      }
    };
  }

  const params = routeParams(leaf.route);

  // A positional with no `:param` to fill it cannot be threaded, and this test
  // must come BEFORE resolution rather than fall out of it: `[].every(...)` is
  // `true`, so a leaf with a required positional and no route params would
  // otherwise resolve by having nothing to resolve. See `ExcludedLeaf.why`.
  if (params.length < leaf.requiredParams.length) {
    return { admitted: false, excluded: { path: leaf.path, why: "positional-not-a-path-param" } };
  }

  return { admitted: true, route: leaf.route, params };
}
