import type { BlockerTaskRow } from "./track-blockers.types";

/**
 * ── WHY THE ANCESTRY IS REBUILT AND WHAT THAT COSTS ─────────────────────────
 *
 * The server tests an edge against the task AND EVERY ANCESTOR OF IT — a plan
 * hangs its dependencies on section parents, and an edge naming a parent holds
 * everything beneath it. The materialised ancestry column that statement reads
 * does not cross the wire: it is absent from the v1 task schema and from the SDK
 * types, and only `parentTaskId` is published. So ancestry is WALKED here.
 *
 * The walk agrees with the column while the two agree with each other. Where
 * they have drifted — a live possibility this domain runs an integrity sweep
 * for — this module reports what the PARENT LINKS say and the server acts on
 * what the column says. That disagreement is worth surfacing and it is not a
 * claim to be right: `WhyNotReadyReport.disagreesWithServer` states that the two
 * answers differ, and nothing here decides which of them is correct.
 */

export interface Ancestry {
  readonly chains: ReadonlyMap<string, readonly string[]>;
  readonly looped: boolean;
}

/**
 * Every row's ancestors, nearest first, walked from `parentTaskId`.
 *
 * The walk is bounded by the number of rows: a chain that revisits an id is a
 * loop, and it stops there rather than running forever. A parent id naming a row
 * outside the plan ends the chain — it is a link this read cannot follow, not a
 * reason to fail.
 *
 * 🚨 THAT SECOND EXIT SETS NO FLAG, AND `looped === false` IS THEREFORE NOT A
 * PROOF THE WALK WAS COMPLETE. `track-blockers.render.empty-line.ts` is where
 * that matters — an incomplete ancestor list can only MISS a hold, never invent
 * one, so a short walk and an unheld plan produce the same empty table.
 */
export function buildAncestry(byId: ReadonlyMap<string, BlockerTaskRow>): Ancestry {
  const chains = new Map<string, readonly string[]>();
  let looped = false;

  for (const row of byId.values()) {
    const chain: string[] = [];
    const seen = new Set<string>([row.id]);
    let cursor = row.parentTaskId;

    while (cursor !== null) {
      if (seen.has(cursor)) {
        looped = true;
        break;
      }
      seen.add(cursor);
      chain.push(cursor);

      const parent = byId.get(cursor);
      if (parent === undefined) break;
      cursor = parent.parentTaskId;
    }

    chains.set(row.id, chain);
  }

  return { chains, looped };
}
