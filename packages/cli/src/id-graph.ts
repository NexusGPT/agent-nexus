import { admitLeaf } from "./id-graph.admission";
import type { ExcludedLeaf, IdGraph, ParamSource, ThreadableLeaf } from "./id-graph.model";
import { sourceFor } from "./id-graph.producer";
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
 * ── WHERE THE TWO HALVES OF THAT LIVE ───────────────────────────────────────
 *
 * {@link import("./id-graph.admission").admitLeaf} is the refusal half: the five
 * reasons a leaf taking an id cannot enter the population, in the order they are
 * askable. {@link import("./id-graph.producer").sourceFor} is the derivation
 * half, and its header carries the two rules — route prefix, then param name —
 * by which a producer is found rather than declared.
 */

export { collectionPrefix, pluralsFor, routeParams } from "./id-graph.route-params";

/** Index every bound `GET` leaf by route, and the param-free ones as collections. */
function indexGetLeaves(leaves: readonly RawLeaf[]): {
  getByRoute: ReadonlyMap<string, RawLeaf>;
  collections: readonly RawLeaf[];
} {
  const getByRoute = new Map<string, RawLeaf>();
  const collections: RawLeaf[] = [];
  for (const leaf of leaves) {
    if (leaf.method !== "GET" || leaf.route === undefined) continue;
    getByRoute.set(leaf.route, leaf);
    // A collection route carries no params of its own, so it can start a chain.
    if (!leaf.route.includes(":")) collections.push(leaf);
  }
  return { getByRoute, collections };
}

/**
 * Build the graph. Pure derivation over the command tree — no network, no auth
 * and no built `dist/`, so the coverage gate runs on a fresh checkout.
 */
export function deriveIdGraph(): IdGraph {
  const leaves = walkLeaves();
  const { getByRoute, collections } = indexGetLeaves(leaves);

  const needsAnId = leaves.filter(
    (leaf) => leaf.disposition === "registration-only" && leaf.requiredParams.length > 0
  );

  const threadable: ThreadableLeaf[] = [];
  const excluded: ExcludedLeaf[] = [];

  for (const leaf of needsAnId) {
    const admission = admitLeaf(leaf);
    if (!admission.admitted) {
      excluded.push(admission.excluded);
      continue;
    }

    const { route, params } = admission;
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
