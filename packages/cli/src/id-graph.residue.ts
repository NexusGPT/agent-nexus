import type { ResidueReason } from "./id-graph.model";

/**
 * THE PARAMS NO DERIVATION RULE CAN RESOLVE, AND WHY EACH ONE CANNOT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS TABLE IS SHORT, AND WHY IT MUST STAY SHORT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `id-graph.ts` resolves a param to its producing leaf with two rules that read
 * the ROUTE TREE, never a list written by hand. A hand-written id map beside an
 * evolving API is the same defect `command-universe.ts` deleted one layer up: it
 * goes stale in silence, and a harness driven by a stale map reads exactly like
 * one driven by a complete map.
 *
 * So this file holds only the residue — the params where BOTH derived rules
 * decline — and every row states which of four things is true. The reason is the
 * whole value of a row: "unresolved" as a single bucket would put a param that
 * needs a fixture next to one that needs nothing but a `bindCommand` call, and
 * those have opposite remedies.
 *
 * 🚨 AN UNRESOLVED PARAM THAT IS NOT IN THIS TABLE IS A GATE FAILURE, never a
 * skip. `id-graph.test.ts` asserts that, and it is the mechanism that stops the
 * population decaying: a new leaf whose param nothing can produce turns the
 * build red until somebody either makes it resolvable or says here why it is
 * not. Deleting a row is never how a red build is fixed.
 *
 * ⚠️ `producer-unbound` ROWS ARE SELF-CLOSING AND SHOULD BE DELETED WHEN THEY
 * CLOSE. Each names a leaf that already exists, already answers, and is already
 * swept — it simply carries no `bindCommand` call, so nothing PROVES it is a
 * read. Land the binding and the derivation resolves the param with no edit
 * here; the test then reports the row as stale.
 */
export interface ResidueEntry {
  /** The leaf whose param cannot be produced. */
  readonly leaf: string;
  /** The `:param` name as it appears in the route. */
  readonly param: string;
  readonly reason: ResidueReason;
  /** Prose a reader can act on. Never "TODO", never "unsupported". */
  readonly because: string;
}

export const RESIDUE: readonly ResidueEntry[] = [
  {
    leaf: "execution node-result",
    param: "nodeId",
    reason: "payload-field",
    because:
      "A node id exists only inside an execution's own response body. There is no collection " +
      "route that lists the nodes of an execution, so the value has to be read out of " +
      "`execution get` rather than listed. Threading it needs a payload-field source, which " +
      "this graph deliberately does not have: reading an id out of a response shape means " +
      "encoding that shape here, and the shape is the thing the sweep exists to check."
  },
  {
    leaf: "agent-tool get",
    param: "toolId",
    reason: "producer-needs-its-own-id",
    because:
      "`agent-tool list` serves this collection and IS bound, but its own route is " +
      "`/agents/:agentId/tools` - it needs an agent id before it can list anything, and the " +
      "runner calls every producer with no arguments. Threading it needs a second hop: list " +
      "the agents, thread one id into the tool list, then read a tool id out of that."
  },
  {
    leaf: "customer get-by-external-id",
    param: "externalUserId",
    reason: "external-key",
    because:
      "The key belongs to the CALLER's system, not to Nexus. No Nexus route can list one, and " +
      "a customer that happens to carry an external id today is a row somebody seeded. " +
      "Reaching this leaf honestly needs a fixture with a known external id, in " +
      "`seed-sweep-fixtures.sh`, not a producer here."
  },
  {
    leaf: "permissions access",
    param: "resourceType",
    reason: "enum-not-an-id",
    because:
      "A closed set of resource kinds, not an id. It is spelled as a path segment, which makes " +
      "it look like every other `:param` in this file, and it is the one shape a producer leaf " +
      "can never serve. The values belong on the flag as `.choices()`."
  },
  {
    leaf: "permissions access",
    param: "resourceId",
    reason: "payload-field",
    because:
      "Meaningful only in combination with the `resourceType` above it — the collection to list " +
      "depends on which enum value was chosen. A single producer route cannot express that, " +
      "and picking one arbitrarily would exercise one resource kind while reporting coverage " +
      "of the leaf."
  },
  {
    leaf: "role access-requests",
    param: "roleId",
    reason: "producer-unbound",
    because:
      "`role list` is `safe` and already swept, but carries no `bindCommand`, so nothing proves it is a GET."
  },
  {
    leaf: "role boards",
    param: "roleId",
    reason: "producer-unbound",
    because: "Same `role list` binding gap as `role access-requests`."
  },
  {
    leaf: "task-eval session list",
    param: "taskId",
    reason: "producer-unbound",
    because: "`task list` is `safe` and already swept, but carries no `bindCommand`."
  },
  {
    leaf: "custom-model get",
    param: "customModelId",
    reason: "producer-unbound",
    because: "`custom-model list` is `safe` and already swept, but carries no `bindCommand`."
  },
  {
    leaf: "tracks task get",
    param: "taskId",
    reason: "producer-unbound",
    because:
      "`tracks task list` IS bound, and its route is `/tracks/:trackId/tasks` — a route that " +
      "needs a track id of its own, so it is not a collection this graph can start from. A " +
      "flat `GET /tracks/tasks` producer would resolve it."
  }
];

/** The declared reason for one leaf's param, or `undefined` when nothing declares it. */
export function residueFor(leaf: string, param: string): ResidueEntry | undefined {
  return RESIDUE.find((entry) => entry.leaf === leaf && entry.param === param);
}
