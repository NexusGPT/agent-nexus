import type { ParamSource } from "./id-graph.model";
import { residueFor } from "./id-graph.residue";
import { collectionPrefix, pluralsFor } from "./id-graph.route-params";
import type { RawLeaf } from "./id-graph.walk";

/**
 * HOW A PRODUCER IS FOUND: TWO DERIVED RULES, NEVER A MAP.
 *
 * 1. THE ROUTE-PREFIX RULE. A param's producer is the bound `GET` leaf serving
 *    the route prefix ending where the param begins. `/agents/:agentId/tools`
 *    takes its `agentId` from whatever serves `GET /agents`. That is not a
 *    convention someone chose — it is what REST nesting means — and it resolves
 *    the large majority on its own.
 *
 * 2. THE PARAM-NAME RULE, tried only when the first declines. A param names the
 *    resource it identifies, so `:deploymentId` is served by the unique bound
 *    `GET` COLLECTION route ending in `/deployments`. `emulator session list` is
 *    the case that needs it: its route is `/emulator/:deploymentId/sessions`, so
 *    the prefix is `/emulator`, which is nobody's collection.
 *
 *    🚨 IT REFUSES ON ANYTHING BUT EXACTLY ONE CANDIDATE. Zero is a residue; two
 *    is ambiguity, and an ambiguous producer picked arbitrarily would exercise
 *    one resource while reporting coverage of a leaf about another.
 *
 * Whatever both rules decline is {@link residueFor}'s business, and an
 * undeclared residue is a gate failure rather than a silent skip.
 */

/**
 * Resolve one param to its producing leaf, or to nothing.
 *
 * Returns `undefined` rather than a residue: this function's job is derivation,
 * and deciding what an unresolved param MEANS is a policy the caller owns.
 */
function resolveProducer(
  route: string,
  param: string,
  getByRoute: ReadonlyMap<string, RawLeaf>,
  collections: readonly RawLeaf[]
): RawLeaf | undefined {
  const prefix = collectionPrefix(route, param);
  if (prefix !== undefined) {
    const direct = getByRoute.get(prefix);
    // The producer must be PARAM-FREE, and this test is the whole rule rather
    // than a refinement of it. The runner invokes every producer with NO
    // arguments, so a nested list that still needs a parent id cannot serve as
    // one: `agent-tool get` would take `agent-tool list` for its `toolId`, that
    // call would go out missing its own `agent-id`, and the leaf would be
    // reported FAILED while the route was perfectly healthy.
    //
    // A false FAILED is worse than an honest skip - it sends somebody to debug
    // a working route. `id-graph.residue.ts` already stated this rule in prose
    // for `tracks task get`; enforcing it here is what makes the prose true.
    if (direct?.route !== undefined && !direct.route.includes(":")) return direct;
  }

  const plurals = pluralsFor(param);
  const candidates = collections.filter((leaf) => plurals.has(leaf.route?.split("/").pop() ?? ""));
  // Exactly one, or nothing. See the docblock on why two is a refusal.
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Where one param gets its value: a producer leaf, or a declared residue. */
export function sourceFor(
  leaf: RawLeaf,
  route: string,
  param: string,
  getByRoute: ReadonlyMap<string, RawLeaf>,
  collections: readonly RawLeaf[]
): ParamSource {
  const producer = resolveProducer(route, param, getByRoute, collections);
  if (producer?.route !== undefined) {
    return { kind: "producer-leaf", param, leaf: producer.path, route: producer.route };
  }

  const declared = residueFor(leaf.path, param);
  return {
    kind: "residue",
    param,
    collectionRoute: collectionPrefix(route, param) ?? "",
    // An UNDECLARED residue keeps a reason-shaped value but an EMPTY `because`,
    // which is what the gate refuses on. It is never silently dropped.
    reason: declared?.reason ?? "producer-unbound",
    because: declared?.because ?? ""
  };
}
