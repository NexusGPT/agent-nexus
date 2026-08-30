/**
 * THE SHAPES OF THE ID GRAPH. Types only — no derivation, no commander, no Zod.
 *
 * Kept separate from `id-graph.ts` for the same reason `contract-help.render.ts`
 * is separate from `v1-contract-projection.ts`: a consumer that wants to NAME one
 * of these shapes should not have to reach a module that builds the whole
 * commander tree to do it.
 */

/** How a leaf's required positional gets a value, or why it cannot. */
export type ParamSource =
  /**
   * A bound `GET` leaf whose route is this param's collection prefix. Derived
   * from the route tree — never declared. `/agents/:agentId/tools` takes its
   * `agentId` from whatever leaf serves `GET /agents`.
   */
  | {
      readonly kind: "producer-leaf";
      readonly param: string;
      readonly leaf: string;
      readonly route: string;
    }
  /**
   * No producer leaf serves the collection prefix, and {@link RESIDUE} declares
   * why. The reason is the whole value of this arm — an undeclared residue is a
   * gate failure, never a silent skip.
   */
  | {
      readonly kind: "residue";
      readonly param: string;
      readonly collectionRoute: string;
      readonly reason: ResidueReason;
      readonly because: string;
    };

/**
 * WHY a param has no producer leaf. Four kinds, and they are not
 * interchangeable — each implies a different remedy, which is the point of
 * separating them rather than counting one "unresolved" total.
 */
export type ResidueReason =
  /** The param is a closed enum, not an id. `:provider`, `:resourceType`. The remedy is `.choices()`, never a list call. */
  | "enum-not-an-id"
  /** The param is a key from OUTSIDE Nexus. `:externalUserId`. No list route can produce one; a fixture must. */
  | "external-key"
  /** The value lives in another leaf's RESPONSE BODY, not in a collection route. `:nodeId` comes from `execution get`. */
  | "payload-field"
  /**
   * A collection route exists but no leaf is CONTRACT-BOUND to it, so its method
   * cannot be proven. This one is a coverage gap that closes itself: land the
   * `bindCommand` call and the param resolves with no edit here.
   */
  | "producer-unbound"
  /**
   * The producer exists and is bound, but its own route carries a `:param`, so
   * it cannot be called with no arguments the way the runner calls producers.
   * Reaching this param needs MULTI-HOP threading - run the parent producer,
   * thread its id into the nested list, then read the child id out of that.
   *
   * Kept as a residue rather than built, because a chain is only honest if every
   * hop reports its own outcome: a leaf skipped at hop 2 must not be reported
   * the same way as one skipped at hop 1, and that is a reporting change, not a
   * loop. It is the single largest thing this graph does not yet do.
   */
  | "producer-needs-its-own-id";

/** One leaf the harness can reach, with every param resolved or declared. */
export interface ThreadableLeaf {
  readonly path: string;
  /** Always `"GET"`. The field is carried so a reader never has to trust the filter. */
  readonly method: "GET";
  readonly route: string;
  /** In route order, which is also argv order — see `id-graph.ts` on why that holds. */
  readonly sources: readonly ParamSource[];
  /** True when every source is a `producer-leaf`. Only these are executed. */
  readonly fullyResolved: boolean;
}

/** A leaf that takes an id and CANNOT enter the population, with the reason. */
export interface ExcludedLeaf {
  readonly path: string;
  readonly why: /** No `bindCommand` call, so nothing proves it is a read. The largest bucket by far. */
  | "unbound-no-provable-method"
    /** Bound, and the contract says it mutates. Refused by construction. */
    | "bound-but-mutates"
    /**
     * A bound `GET` whose required positionals outnumber its route's `:params`,
     * so at least one positional is not a path variable and no producer route
     * can fill it — a query argument, or a key from another vocabulary
     * altogether.
     *
     * 🚨 THIS ARM EXISTS BECAUSE ITS ABSENCE WAS A VACUOUS GREEN. Resolution
     * asks whether EVERY source resolved, and `[].every(...)` is `true`, so a
     * leaf with a required positional and NO route params resolved perfectly by
     * having nothing to resolve. `known-issues <route-id>` did exactly that:
     * its positional is a CLI route id sent as a query argument, and it landed
     * in the executable set with an empty producer list. It would then have been
     * invoked with no argument at all and reported against whatever the CLI did
     * with that.
     */
    | "positional-not-a-path-param"
    /**
     * A bound `GET` declaring a commander `.requiredOption()`. The harness passes
     * positionals and `--json` and nothing else, so it CANNOT satisfy one.
     *
     * 🚨 THIS IS bugbot's NESTED-PRODUCER FINDING IN ITS SECOND SHAPE, and it
     * cost five false FAILEDs on live staging before it was closed. Admitting a
     * leaf while supplying less than it requires does not test the route: the
     * CLI refuses the call, and the harness reports the refusal as if the
     * endpoint were broken. Required INPUTS are one question, and a positional
     * is only one kind of input.
     */
    | "requires-an-option-we-cannot-supply"
    /**
     * Declared in `id-graph.leaf-residue.ts` — a requirement no derivation can
     * see, or an exit code that reports the resource's state rather than the
     * route's health.
     */
    | "declared-unsweepable";
  /** Present only for `bound-but-mutates`. */
  readonly method?: string;
  /** For `requires-an-option-we-cannot-supply`, the flags that cannot be filled. */
  readonly unsatisfiable?: readonly string[];
}

export interface IdGraph {
  /** Every leaf in the tree, for the denominator. */
  readonly totalLeaves: number;
  /** `registration-only` leaves taking at least one required positional. */
  readonly needsAnId: number;
  /** The population: bound, `GET`, takes an id. */
  readonly threadable: readonly ThreadableLeaf[];
  /** The subset the runner executes — every param has a producer. */
  readonly executable: readonly ThreadableLeaf[];
  /** Takes an id and is not threadable, with the reason. */
  readonly excluded: readonly ExcludedLeaf[];
}
