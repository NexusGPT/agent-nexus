import { blockersHolding } from "./track-blockers.holds";
import { buildPlanIndex, isDone } from "./track-blockers.plan-index";
import type {
  BlockerEdgeRow,
  BlockerTaskRow,
  UnreadyTask,
  WhyNotReadyReport
} from "./track-blockers.types";

/**
 * WHY AN OPEN TASK IS NOT IN THE READY SET — reconstructed on the client, from
 * the three reads this API already publishes.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 EVERY ANSWER THIS MODULE PRODUCES IS A RECONSTRUCTION, NEVER THE SERVER'S
 *    OWN REASON. SAY SO WHEREVER IT IS PRINTED.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The ready set is an anti-join computed in one SQL statement inside the API,
 * and that statement publishes nothing about why it withheld a row. So a board
 * could read `127 of 156 done`, hold 29 open rows, and answer the ready set with
 * ZERO — indistinguishable from a board that is nearly finished, with no route
 * that named the offending edge. Reported from production; this module is the
 * client-side half of the answer.
 *
 * It re-derives the server's predicate from `listTasks()` + `listTaskEdges()`.
 * That derivation is faithful while the data is healthy and DIVERGES FROM THE
 * SERVER EXACTLY WHERE THE SERVER'S OWN ANCESTRY COLUMN HAS DRIFTED — see
 * `track-blockers.ancestry.ts`. A caller must never read the output as
 * authoritative: `tracks task ready` remains the only thing that says what may
 * be picked up.
 *
 * ── THE FAMILY ──────────────────────────────────────────────────────────────
 *
 * This file is the PUBLIC NAME: every importer in the package names this path,
 * and every type it ever exported is re-exported here unchanged. The four
 * leaves behind it are `track-blockers.types.ts` (the shapes, importing one
 * wire type and nothing else), `track-blockers.ancestry.ts` (the parent walk
 * and why it exists), `track-blockers.plan-index.ts` (the server predicate,
 * decided once over the whole plan) and `track-blockers.holds.ts` (the edges
 * holding one leaf, its own and its ancestors'). No leaf imports this file
 * back, so `import/no-cycle` has nothing to report.
 */

export type {
  BlockerEdgeRow,
  BlockerHold,
  BlockerTaskRow,
  HoldingBlocker,
  UnreadyReason,
  UnreadyTask,
  WhyNotReadyReport
} from "./track-blockers.types";

/** The fields of a row that survive into the report, whatever the reason. */
const rowOf = (task: BlockerTaskRow): Pick<UnreadyTask, "id" | "title" | "kind"> => ({
  id: task.id,
  title: task.title,
  kind: task.kind
});

/**
 * Explain every open row a track's ready set does not offer.
 *
 * 🔴 HAND OVER THE WHOLE PLAN. A partial page makes parents whose children were
 * not fetched look like leaves, and the answer is then a plausible wrong one
 * rather than an error. `listTasks()` is not paged, which is why it is the right
 * read to compose here.
 *
 * @param tasks every row of the track's plan, at every depth
 * @param edges every task edge of that track
 * @param serverReadyIds the ids `listReadyTasks()` returned, for the cross-check
 * @param serverReadyTruncated whether that answer hit its own limit
 */
export function explainUnreadyTasks(
  tasks: readonly BlockerTaskRow[],
  edges: readonly BlockerEdgeRow[],
  serverReadyIds: readonly string[],
  serverReadyTruncated: boolean
): WhyNotReadyReport {
  const plan = buildPlanIndex(tasks, edges);

  const unready: UnreadyTask[] = [];
  const reconstructedReadyIds: string[] = [];

  for (const task of tasks) {
    if (isDone(task.doneAt)) continue;

    if (!plan.isWork(task)) {
      unready.push({ ...rowOf(task), reason: "CONTENT", blockers: [] });
      continue;
    }
    if (!plan.isWorkLeaf(task)) {
      unready.push({ ...rowOf(task), reason: "STRUCTURE", blockers: [] });
      continue;
    }

    const blockers = blockersHolding(task, plan);
    if (blockers.length === 0) reconstructedReadyIds.push(task.id);
    else unready.push({ ...rowOf(task), reason: "BLOCKED", blockers });
  }

  return {
    unready,
    reconstructedReadyIds,
    disagreesWithServer: serverReadyTruncated
      ? null
      : !sameSet(reconstructedReadyIds, serverReadyIds),
    ancestryLooped: plan.ancestryLooped
  };
}

/** Two id lists naming the same rows, order and repetition ignored. */
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/**
 * The one sentence that must travel with every rendering of this answer.
 *
 * Exported so the human channel and the JSON document carry the SAME words. A
 * caveat printed in one channel and not the other is a caveat a script never
 * sees, and a script is the caller most likely to treat this as authoritative.
 */
export const RECONSTRUCTION_CAVEAT =
  "Reconstructed on the client from the plan and its edges — NOT the server's own reason. " +
  "The API does not publish the ancestry column its ready-set query reads, so ancestry is " +
  "rebuilt by walking parentTaskId. That agrees with the server while the two are in step " +
  "and diverges exactly where they have drifted. `nexus tracks task ready` stays the only " +
  "authority on what may be picked up.";
