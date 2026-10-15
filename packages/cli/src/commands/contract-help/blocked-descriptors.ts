import type { BlockedReason } from "./blocked-reasons";

/**
 * THE REFUSALS THIS PASS ESTABLISHED, one record per descriptor.
 *
 * ── What is NOT here, and why that is a decision rather than a backlog ───────
 *
 * A descriptor enters this list only when EVERY enum it declares can reach a
 * flag or a positional, or be honestly declared body-only. The gate is
 * all-or-nothing per descriptor, so one contract enum the CLI cannot express
 * blocks its whole descriptor.
 *
 * 🚨 {@link BLOCKED_DESCRIPTORS} IS THE AUTHORITY ON WHY, AND THIS PARAGRAPH IS
 * ONLY ITS SUMMARY. A reason typed there is a value, `test/unit/contract-blocked
 * .test.ts` walks every record on every run, and its four arms are the reason to
 * read the const rather than this text:
 *
 *   · a descriptor a CLI leaf CALLS is bound or blocked. There is no third state,
 *     and an unclassified one is RED by name.
 *   · an unknown reason does not compile, and neither does a reason the union
 *     gains while the audit does not learn it.
 *   · every path a record calls `unreachable` is REACHED, not believed — through a
 *     flag, a positional, `--body` or a `bodyOnly` declaration. A refusal that has
 *     merely STOPPED being true is RED.
 *   · `reachable-not-yet-bound` and `route-twin-bound-elsewhere` assert the
 *     opposite and are checked the opposite way: every enum must be reachable, so
 *     "nobody got to it" cannot be written down as "it cannot be done".
 *
 * That last arm is what prose could not do. This list said commander validates
 * `.choices()` on options only; the sentence was never measured, it is false, and
 * it cost four descriptors their binding while reading exactly like a fact.
 *
 * A SECOND shape stops a namespace, and no `BlockedReason` can express it,
 * because every member of that union is a statement ABOUT A DESCRIPTOR while
 * this one is the absence of any: a namespace whose leaves call no v1 route at
 * all. `uncontracted-namespaces.ts` records those in `UNCONTRACTED_NAMESPACES`,
 * with the surface each one calls instead.
 */

export interface BlockedDescriptor {
  /** Key into `ZPublicApiV1`. */
  readonly descriptor: string;
  readonly reason: BlockedReason;
  /** The leaf that would have been bound, e.g. `customer list`. */
  readonly leaf: string;
  /** Contract paths, relative to the descriptor, that nothing can reach. */
  readonly unreachable: readonly string[];
}

/**
 * The refusals THIS pass established by reading the command file, never by
 * inference. A descriptor absent from here is unexamined, not cleared.
 *
 * Re-derive the population it is a subset of rather than trusting its length —
 * the numbers move with every namespace anyone converts:
 *
 *   every key of `ZPublicApiV1` whose projection carries an enum field, minus
 *   every descriptor named in `GENERATED_NAMESPACES`.
 */
export const BLOCKED_DESCRIPTORS: readonly BlockedDescriptor[] = [
  {
    // `execution list --workflow-id` switches this leaf to the path-scoped
    // route. Both routes carry the SAME three enums — status, sortBy, order —
    // and differ only in where the workflow id travels, so the default branch
    // binds and this is the `channel setup` shape, not a wall.
    descriptor: "WorkflowExecutionListForWorkflow",
    reason: "route-twin-bound-elsewhere",
    leaf: "execution list --workflow-id",
    unreachable: []
  },
  {
    descriptor: "ModelList",
    reason: "no-projected-fields",
    leaf: "model list",
    unreachable: []
  },
  {
    // `auth` IS THE SECOND MEMBER OF `model`'s CLASS, and it took a lane reading
    // the projection to see it: this namespace looks local — login, logout,
    // switch, pin, list and status touch nothing but the profile file on disk —
    // and TWO of its leaves are live reads of the v1 contract. Both project
    // nothing, so the generator refuses the whole namespace.
    //
    // Neither is in the audit's `calledBy` map either, and that is not an
    // oversight: `auth` uses raw `fetch` against an absolute URL rather than the
    // SDK client, so the route scanner resolves no descriptor for it. That is
    // precisely why the record is worth writing — nothing else in this repo
    // says these two routes have a CLI caller.
    descriptor: "MeGet",
    reason: "no-projected-fields",
    leaf: "auth whoami",
    unreachable: []
  },
  {
    descriptor: "MeListOrganizations",
    reason: "no-projected-fields",
    leaf: "auth orgs",
    unreachable: []
  },
  {
    // `channel setup` sends --auto to autoProvision and otherwise to
    // getSetupStatus. `--type` already carries this enum on the leaf, so the
    // block is the one-shape-per-command limit, never the flag.
    descriptor: "ChannelSetupGet",
    reason: "route-twin-bound-elsewhere",
    leaf: "channel setup",
    unreachable: []
  }
];
