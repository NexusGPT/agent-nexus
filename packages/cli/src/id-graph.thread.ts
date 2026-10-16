import { idsFrom } from "./id-graph.ids";
import type { ThreadableLeaf } from "./id-graph.model";
import type { ThreadedId } from "./id-graph.race.types";
import { blockedByBrokenProducer, blockedByNoUsableId } from "./id-graph.thread.blocked";
import type { ThreadPlan } from "./id-graph.thread.plan";

/**
 * WHICH IDS ONE LEAF IS ABOUT TO BE GIVEN, or why it cannot be invoked at all.
 *
 * Pure, and in `src/` rather than in the runner for the reason that module's own
 * header states: `scripts/id-thread-sweep.ts` ends in `main()`, so importing it
 * RUNS the sweep and nothing in it can be reached by a spec. Every piece of this
 * harness's decision-making has had to move out for exactly that reason — the
 * refusal parser, the outcome mapping, the race verdict, and now this.
 *
 * It exists as its own step because the sweep re-threads: when a row is proven
 * to have been deleted underneath a call, the leaf is planned AGAIN against a
 * fresh producer body, skipping the ids already proven gone. Doing that inside
 * the runner's loop would put the one branch that decides whether a leaf is
 * retried somewhere no test can see it.
 *
 * The two ways a single source stops the plan — a producer that did not answer,
 * and a producer that offered nothing usable — are `id-graph.thread.blocked.ts`,
 * which owns the discriminator inside each.
 */

export type { ThreadPlan } from "./id-graph.thread.plan";

/** Shared empty set, so the lookup below needs no allocation per source. */
const EMPTY: ReadonlySet<string> = new Set();

/**
 * Plan one leaf's invocation from the producer bodies this run holds.
 *
 * `vanishedBy` maps a PRODUCER to the ids of its rows this leaf has already
 * proven were deleted underneath it, so a retry cannot pick one back up. Two
 * properties, and both are load-bearing:
 *
 * 🚨 **IT IS KEYED BY PRODUCER, NOT A FLAT SET OF IDS.** A leaf can thread from
 * more than one producer, and the two questions "did THIS producer lose the row
 * we used" and "has anything vanished anywhere" have different answers. A flat
 * set answers the second, and the caller below needs the first — see the empty
 * branch.
 *
 * ⚠️ Skipping an id is normally redundant, since an id that vanished is by
 * definition no longer in its producer's fresh body. It is kept because that
 * redundancy is exactly what would fail silently: a producer whose list is
 * served from a cache, or a delete that only soft-deletes on one route, would
 * hand the same doomed id back and the retry would spin on it.
 */
export function planThread(
  leaf: ThreadableLeaf,
  bodyOf: ReadonlyMap<string, string>,
  producerBroke: ReadonlyMap<string, string>,
  vanishedBy: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
  /**
   * Producer leaf → the path `SWEEP_ROUTES_PENDING_DEPLOY` declares absent, for
   * the producers whose CURRENT failure the shell matcher confirmed IS that
   * absence. Presence is the verdict; this function never re-derives it.
   *
   * Defaulted so every existing caller and spec is unchanged, and so the
   * dangerous direction needs an explicit argument: an empty map scores every
   * broken producer FAILED, which is what the sweep did before.
   */
  producerPendingDeploy: ReadonlyMap<string, string> = new Map()
): ThreadPlan {
  const args: string[] = [];
  const threaded: ThreadedId[] = [];

  for (const source of leaf.sources) {
    if (source.kind !== "producer-leaf") continue;

    const broke = producerBroke.get(source.leaf);
    if (broke !== undefined) {
      return blockedByBrokenProducer(source, broke, producerPendingDeploy.get(source.leaf));
    }

    const lostHere = vanishedBy.get(source.leaf) ?? EMPTY;
    const offered = idsFrom(bodyOf.get(source.leaf) ?? "", source.param);
    const usable = offered.filter((id) => !lostHere.has(id));
    if (usable.length === 0) {
      return blockedByNoUsableId(source, lostHere.size, offered.length);
    }

    args.push(usable[0]);
    threaded.push({ param: source.param, producer: source.leaf, id: usable[0] });
  }

  return { kind: "ready", args, threaded };
}
