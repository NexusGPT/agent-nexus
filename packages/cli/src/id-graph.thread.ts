import { idsFrom } from "./id-graph.ids";
import type { ThreadableLeaf } from "./id-graph.model";
import type { LeafOutcome } from "./id-graph.outcome";
import type { ThreadedId } from "./id-graph.race";

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
 */

/** Shared empty set, so the lookup below needs no allocation per source. */
const EMPTY: ReadonlySet<string> = new Set();

/** What to invoke a leaf with, or the verdict that stops it being invoked. */
export type ThreadPlan =
  | {
      readonly kind: "ready";
      readonly args: readonly string[];
      readonly threaded: readonly ThreadedId[];
    }
  | { readonly kind: "blocked"; readonly status: LeafOutcome; readonly note: string };

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
  vanishedBy: ReadonlyMap<string, ReadonlySet<string>> = new Map()
): ThreadPlan {
  const args: string[] = [];
  const threaded: ThreadedId[] = [];

  for (const source of leaf.sources) {
    if (source.kind !== "producer-leaf") continue;

    const broke = producerBroke.get(source.leaf);
    if (broke !== undefined) {
      // A producer that ERRORED is not a producer that is EMPTY. Conflating them
      // would report a broken list route as "nothing to test with", which is the
      // exact substitution this harness exists to refuse.
      return {
        kind: "blocked",
        status: "FAILED",
        note: `producer \`${source.leaf}\` failed: ${broke}`
      };
    }

    const lostHere = vanishedBy.get(source.leaf) ?? EMPTY;
    const offered = idsFrom(bodyOf.get(source.leaf) ?? "", source.param);
    const usable = offered.filter((id) => !lostHere.has(id));
    if (usable.length === 0) {
      // 🚨 TWO REASONS, TWO STATUSES, AND THE DISCRIMINATOR IS `lostHere` — NEVER
      // `offered.length`. "The producer has no rows" and "every row it had was
      // deleted underneath this leaf" are different facts, and reporting the
      // second under the first's wording hides a live race behind a sentence
      // that is simply untrue.
      //
      // 🔴 READING IT OFF `offered.length` GETS THE RACE-AT-FULL-STRENGTH CASE
      // EXACTLY BACKWARDS, which is the bug this branch shipped with. When the
      // re-read that PROVED the deletion also comes back EMPTY — the producer's
      // last row was the one that vanished — `offered.length === 0` is true and
      // the old test called it "returned zero rows". That is the single case the
      // fifth outcome exists for, rendered as the ordinary skip a reader scrolls
      // past. `lostHere` is non-empty exactly when this producer lost a row we
      // used, whether or not anything survived it.
      //
      // ⚠️ And it is per-producer for the other direction: a leaf threading two
      // producers, where A raced and B is legitimately empty, must still report
      // B as SKIPPED_NO_ID. A flat "has anything vanished" set answers that one
      // wrong too, in the opposite direction.
      if (lostHere.size > 0) {
        return {
          kind: "blocked",
          status: "SKIPPED_ID_VANISHED",
          note:
            `every \`${source.param}\` producer \`${source.leaf}\` offered was deleted ` +
            `mid-sweep (${lostHere.size} proven gone, ${offered.length} still listed)`
        };
      }
      return {
        kind: "blocked",
        status: "SKIPPED_NO_ID",
        note: `no \`${source.param}\` existed - producer \`${source.leaf}\` returned zero rows`
      };
    }

    args.push(usable[0]);
    threaded.push({ param: source.param, producer: source.leaf, id: usable[0] });
  }

  return { kind: "ready", args, threaded };
}
