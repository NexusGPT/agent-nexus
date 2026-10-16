import type { TrackTaskKind } from "@agent-nexus/sdk";

import { buildAncestry } from "./track-blockers.ancestry";
import type { BlockerEdgeRow, BlockerHold, BlockerTaskRow } from "./track-blockers.types";

/**
 * ── THE PREDICATE, RESTATED FROM THE SERVER STATEMENT ────────────────────────
 *
 * A row is OFFERED when all three hold:
 *
 *   1. it is WORK — `STEP`. `DECISION` and `DEFINITION` are content recorded on
 *      the board and are never offered.
 *   2. it is a WORK LEAF — no WORK row hangs directly beneath it. A `STEP` with
 *      only a `DECISION` under it is still a leaf.
 *   3. it is open, and every edge holding it is SATISFIED.
 *
 * An edge's blocker is satisfied when the blocker is itself done, OR when the
 * blocker is STRUCTURE — a work row that is not a leaf — and every work leaf
 * beneath it is done. That second arm is the roll-up's rule, not a second one:
 * a parent is structure, not work, so doing the work under it is what finishes
 * it.
 *
 * 🔴 THE THIRD CASE OF THAT ARM FAILS CLOSED, AND SO DOES THIS. A structure row
 * with NO work leaf beneath it is held rather than released: an empty descendant
 * set read as a completed one releases everything waiting on the parent, which
 * is the one way an anti-join fails open. It is reported here as
 * `NO_WORK_BENEATH`, and it is worth a reader's attention because it only ever
 * means something is broken: on the SERVER it can only arise from ancestry
 * drift, and HERE only from the parent links themselves looping — the same
 * defect one layer down.
 *
 * Every clause above is decided ONCE here, over the whole plan, and the answers
 * are read back by id. `explainUnreadyTasks` then asks questions rather than
 * recomputing them, which is what keeps one rule in one place.
 */

/**
 * Which kinds are WORK.
 *
 * 🔴 A `Record` OVER THE WIRE UNION RATHER THAN A `=== "STEP"` TEST, so a fourth
 * kind landing in the SDK type is a compile error at this line instead of a row
 * silently classified as content. The product's own source of truth for this is
 * `TASK_KIND_COUNTS_AS_WORK` in `@nexus/types`; it is restated here rather than
 * imported because this package deliberately talks to the API through the wire
 * types alone and does not pull `@nexus/types` into the published bundle — the
 * same reason `vibe-regions.ts` re-declares its own enum.
 */
const KIND_IS_WORK: Readonly<Record<TrackTaskKind, boolean>> = {
  STEP: true,
  DECISION: false,
  DEFINITION: false
};

/** `doneAt` is present. `!= null` refuses `undefined` too, which a JSON row loses a null to. */
export const isDone = (doneAt: string | null | undefined): boolean => doneAt != null;

/** Every question about one plan, answered once and read back by id. */
export interface PlanIndex {
  readonly byId: ReadonlyMap<string, BlockerTaskRow>;
  /** Each row's ancestors, nearest first. */
  readonly chains: ReadonlyMap<string, readonly string[]>;
  /** `true` when a parent chain looped and the walk stopped early. */
  readonly ancestryLooped: boolean;
  /** Edges keyed by the id they NAME, so a row's own and its ancestors' look up alike. */
  readonly edgesByBlocked: ReadonlyMap<string, readonly BlockerEdgeRow[]>;
  isWork(task: BlockerTaskRow): boolean;
  isWorkLeaf(task: BlockerTaskRow): boolean;
  /** Why this blocker is not satisfied, or `null` when it is. */
  holdOf(blocker: BlockerTaskRow | undefined): BlockerHold | null;
}

export function buildPlanIndex(
  tasks: readonly BlockerTaskRow[],
  edges: readonly BlockerEdgeRow[]
): PlanIndex {
  const byId = new Map<string, BlockerTaskRow>();
  for (const task of tasks) byId.set(task.id, task);

  // `!== false` rather than a truth test, so a kind this build has never heard
  // of — an older CLI against a newer API — reads as WORK. That is the product's
  // own default for an unset or unrecognised kind, and the opposite reading would
  // silently reclassify real steps as content and hide them from this answer.
  const isWork = (task: BlockerTaskRow): boolean => KIND_IS_WORK[task.kind] !== false;

  // A row is STRUCTURE when a WORK row hangs directly beneath it. Content
  // children do not make a parent structure — the server's leaf test runs over
  // the work rows alone, and a STEP with only a DECISION under it is a leaf.
  const hasWorkChild = new Set<string>();
  for (const task of tasks) {
    if (!isWork(task)) continue;
    if (task.parentTaskId !== null) hasWorkChild.add(task.parentTaskId);
  }
  const isWorkLeaf = (task: BlockerTaskRow): boolean => isWork(task) && !hasWorkChild.has(task.id);

  const { chains, looped } = buildAncestry(byId);

  // Every work leaf beneath a row, keyed by that row. Built by walking each
  // leaf's own ancestry upward, so it costs one pass rather than a search per
  // blocker.
  const workLeavesUnder = new Map<string, BlockerTaskRow[]>();
  for (const task of tasks) {
    if (!isWorkLeaf(task)) continue;
    for (const ancestorId of chains.get(task.id) ?? []) {
      const bucket = workLeavesUnder.get(ancestorId);
      if (bucket === undefined) workLeavesUnder.set(ancestorId, [task]);
      else bucket.push(task);
    }
  }

  const edgesByBlocked = new Map<string, BlockerEdgeRow[]>();
  for (const edge of edges) {
    const bucket = edgesByBlocked.get(edge.blockedTaskId);
    if (bucket === undefined) edgesByBlocked.set(edge.blockedTaskId, [edge]);
    else bucket.push(edge);
  }

  const holdOf = (blocker: BlockerTaskRow | undefined): BlockerHold | null => {
    if (blocker === undefined) return "UNKNOWN_TASK";
    if (isDone(blocker.doneAt)) return null;
    if (!isWork(blocker) || isWorkLeaf(blocker)) return "OPEN";

    const beneath = workLeavesUnder.get(blocker.id) ?? [];
    if (beneath.length === 0) return "NO_WORK_BENEATH";
    return beneath.every((leaf) => isDone(leaf.doneAt)) ? null : "SUBTREE_OPEN";
  };

  return { byId, chains, ancestryLooped: looped, edgesByBlocked, isWork, isWorkLeaf, holdOf };
}
