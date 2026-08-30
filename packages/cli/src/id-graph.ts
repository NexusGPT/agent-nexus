import { leafResidueFor } from "./id-graph.leaf-residue";
import type { ExcludedLeaf, IdGraph, ParamSource, ThreadableLeaf } from "./id-graph.model";
import { residueFor } from "./id-graph.residue";
import { type RawLeaf, walkLeaves } from "./id-graph.walk";

/**
 * THE ID GRAPH — which leaf produces the id another leaf needs, DERIVED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `scripts/sweep.sh` executes the leaves that need no input. Most of the CLI is
 * not that shape: `agent-tool get <agentId> <toolId>` cannot be swept blind, and
 * it sits at `registration-only` for exactly that reason — the disposition's own
 * docblock says it covers "a mutation, OR a read that needs a required
 * positional".
 *
 * 🚨 THOSE TWO ARE OPPOSITE FACTS SHARING ONE BUCKET, and that conflation is the
 * whole gap this module closes. `agent delete <id>` and `agent get <id>` are both
 * `registration-only`; one must never run in a sweep, and the other is a read
 * that is perfectly safe the moment something hands it an id.
 *
 * ── WHAT REFUSES A WRITE ─────────────────────────────────────────────────────
 *
 * A leaf enters the population only when its contract binding reports
 * `method === "GET"`. That is a POSITIVE proof read off the Public API v1
 * contract, not an inference from the leaf's name. There is no branch by which a
 * `POST`, `PATCH`, `PUT` or `DELETE` is admitted, and no allowlist to append to.
 *
 * This matters more than it looks. A verb-name classifier over this surface
 * would be reading ~150 distinct terminal verbs and guessing about `trigger`,
 * `execute`, `provision`, `claim` and `resume` — every one of which mutates, and
 * several of which read like reports. Guessing wrong there issues a write
 * against live staging. A contract cannot be guessed wrong; where it is absent
 * the leaf is EXCLUDED and counted, never assumed.
 *
 * ── THE COST OF THAT STRICTNESS, STATED RATHER THAN HIDDEN ───────────────────
 *
 * Most leaves that take an id carry no contract binding, so their method is
 * unprovable and they are excluded. That is the honest ceiling of this harness
 * and {@link IdGraph.excluded} reports it on every run — a number saying "these
 * were not exercised" is worth more than a green that swept a fraction of what
 * it claimed. It is also a gap that closes itself: every `bindCommand` call
 * anyone lands moves leaves into the population with no edit to this file.
 *
 * ── HOW A PRODUCER IS FOUND: TWO DERIVED RULES, NEVER A MAP ──────────────────
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

/** The `:param` names of a route, in route order. */
export function routeParams(route: string): string[] {
  return route
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));
}

/** The route prefix ending immediately before `:param`. */
export function collectionPrefix(route: string, param: string): string | undefined {
  const segments = route.split("/");
  const index = segments.indexOf(`:${param}`);
  return index < 0 ? undefined : segments.slice(0, index).join("/");
}

/**
 * The plural resource spellings a param name could identify.
 *
 * `customModelId` -> `custom-models`; `roleId` -> `roles`. Both the camel and
 * the kebab spelling of the id suffix are stripped, because the tree carries
 * both (`agent-id` beside `agentId` beside a bare `id`).
 */
export function pluralsFor(param: string): Set<string> {
  const base = param.replace(/Id$/, "").replace(/-id$/, "");
  const kebab = base.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return new Set([`${kebab}s`, `${kebab}es`, kebab.replace(/y$/, "ies")]);
}

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

function sourceFor(
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

/**
 * Build the graph. Pure derivation over the command tree — no network, no auth
 * and no built `dist/`, so the coverage gate runs on a fresh checkout.
 */
export function deriveIdGraph(): IdGraph {
  const leaves = walkLeaves();

  const getByRoute = new Map<string, RawLeaf>();
  const collections: RawLeaf[] = [];
  for (const leaf of leaves) {
    if (leaf.method !== "GET" || leaf.route === undefined) continue;
    getByRoute.set(leaf.route, leaf);
    // A collection route carries no params of its own, so it can start a chain.
    if (!leaf.route.includes(":")) collections.push(leaf);
  }

  const needsAnId = leaves.filter(
    (leaf) => leaf.disposition === "registration-only" && leaf.requiredParams.length > 0
  );

  const threadable: ThreadableLeaf[] = [];
  const excluded: ExcludedLeaf[] = [];

  for (const leaf of needsAnId) {
    if (leaf.method === undefined || leaf.route === undefined) {
      excluded.push({ path: leaf.path, why: "unbound-no-provable-method" });
      continue;
    }
    if (leaf.method !== "GET") {
      excluded.push({ path: leaf.path, why: "bound-but-mutates", method: leaf.method });
      continue;
    }

    // A requirement no derivation can see. Measured against live staging and
    // declared, because the alternative is a false FAILED on a healthy route.
    if (leafResidueFor(leaf.path) !== undefined) {
      excluded.push({ path: leaf.path, why: "declared-unsweepable" });
      continue;
    }

    // 🚨 EVERY REQUIRED INPUT, NOT JUST THE POSITIONAL ONES. The harness passes
    // positionals and `--json`; a `.requiredOption()` is an input it cannot fill,
    // so admitting the leaf would test the CLI's own refusal rather than the
    // route. Five leaves reported FAILED on live staging this way before the
    // check existed, every one of them healthy.
    if (leaf.mandatoryOptions.length > 0) {
      excluded.push({
        path: leaf.path,
        why: "requires-an-option-we-cannot-supply",
        unsatisfiable: leaf.mandatoryOptions
      });
      continue;
    }

    const route = leaf.route;
    const params = routeParams(route);

    // A positional with no `:param` to fill it cannot be threaded, and this test
    // must come BEFORE resolution rather than fall out of it: `[].every(...)` is
    // `true`, so a leaf with a required positional and no route params would
    // otherwise resolve by having nothing to resolve. See `ExcludedLeaf.why`.
    if (params.length < leaf.requiredParams.length) {
      excluded.push({ path: leaf.path, why: "positional-not-a-path-param" });
      continue;
    }

    const sources = params.map((param) => sourceFor(leaf, route, param, getByRoute, collections));

    threadable.push({
      path: leaf.path,
      method: "GET",
      route,
      sources,
      fullyResolved: sources.every((source) => source.kind === "producer-leaf")
    });
  }

  return {
    totalLeaves: leaves.length,
    needsAnId: needsAnId.length,
    threadable,
    executable: threadable.filter((leaf) => leaf.fullyResolved),
    excluded
  };
}

/** Every residue across the graph, for the gate and the report. */
export function residues(
  graph: IdGraph
): Array<{ leaf: string; source: Extract<ParamSource, { kind: "residue" }> }> {
  const out: Array<{ leaf: string; source: Extract<ParamSource, { kind: "residue" }> }> = [];
  for (const leaf of graph.threadable) {
    for (const source of leaf.sources) {
      if (source.kind === "residue") out.push({ leaf: leaf.path, source });
    }
  }
  return out;
}
