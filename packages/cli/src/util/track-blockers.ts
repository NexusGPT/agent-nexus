import type { TrackTaskKind } from "@agent-nexus/sdk";

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
 * SERVER EXACTLY WHERE THE SERVER'S OWN ANCESTRY COLUMN HAS DRIFTED — see the
 * ancestry section below. A caller must never read the output as authoritative:
 * `tracks task ready` remains the only thing that says what may be picked up.
 *
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
 * claim to be right: {@link WhyNotReadyReport.disagreesWithServer} states that
 * the two answers differ, and nothing here decides which of them is correct.
 *
 * ⚠️ COMPOSING ON A TASK'S OWN EDGES ALONE UNDER-REPORTS. Reading only the edges
 * that name the task itself as `blockedTaskId` misses every edge hung on an
 * ancestor, which is the natural shape a plan import produces and the shape the
 * production report was about. {@link HoldingBlocker.viaAncestorTaskId} is that
 * difference, named on every row it applies to.
 */

/** The task fields this reconstruction reads. Anything wider is the caller's business. */
export interface BlockerTaskRow {
  readonly id: string;
  /** `null` for a root row. */
  readonly parentTaskId: string | null;
  readonly kind: TrackTaskKind;
  readonly title: string;
  /** ISO-8601, or `null` while the task is open. */
  readonly doneAt: string | null;
}

/** The edge fields this reconstruction reads. `blockerTaskId` finishes first. */
export interface BlockerEdgeRow {
  readonly blockerTaskId: string;
  readonly blockedTaskId: string;
}

/**
 * Why one blocker is not satisfied.
 *
 * `UNKNOWN_TASK` is the one member that is not a server state: it means the edge
 * names a row the plan handed in does not contain, which cannot happen against a
 * whole-plan read and is reported rather than assumed away.
 */
export type BlockerHold = "OPEN" | "SUBTREE_OPEN" | "NO_WORK_BENEATH" | "UNKNOWN_TASK";

/** What a row IS, when it is not offered. */
export type UnreadyReason = "BLOCKED" | "STRUCTURE" | "CONTENT";

/** One blocker holding one task, with the fact a reader asked for: work or content. */
export interface HoldingBlocker {
  readonly taskId: string;
  readonly title: string;
  /** `null` when the edge names a row outside the plan handed in. */
  readonly kind: TrackTaskKind | null;
  /** `true` for `STEP`. `false` for content, and for a row that is not in the plan. */
  readonly isWork: boolean;
  /** `true` when this row has work beneath it, so its subtree finishes it. */
  readonly isStructure: boolean;
  readonly done: boolean;
  readonly hold: BlockerHold;
  /**
   * The ANCESTOR the edge actually names, when it is not the held task itself.
   *
   * 🔴 THIS IS THE HALF A COMPOSITION BUILT ON "edges naming it as blockedTaskId"
   * LOSES. An edge hung on a section parent holds every row beneath it, and that
   * row's own edge list is empty.
   */
  readonly viaAncestorTaskId: string | null;
}

/** One open row the ready set does not offer, and what is holding it. */
export interface UnreadyTask {
  readonly id: string;
  readonly title: string;
  readonly kind: TrackTaskKind;
  readonly reason: UnreadyReason;
  /** Non-empty only when `reason` is `BLOCKED`. */
  readonly blockers: readonly HoldingBlocker[];
}

/** The whole answer for one track. */
export interface WhyNotReadyReport {
  /**
   * Every open row the ready set does not offer, in the order the plan read
   * returned them — grouped by parent, then by position. No order is invented.
   */
  readonly unready: readonly UnreadyTask[];
  /** The ids this reconstruction believes are offerable, for the cross-check. */
  readonly reconstructedReadyIds: readonly string[];
  /**
   * `true` when the reconstruction and the server name different sets.
   *
   * 🔴 NOT A VERDICT ON EITHER SIDE. It is the observable consequence of the
   * ancestry column and the parent links having drifted apart, and either one
   * could be the stale half. `null` when the server's answer was truncated by
   * its limit, because a shorter list is then not a disagreement.
   */
  readonly disagreesWithServer: boolean | null;
  /**
   * `true` when a parent chain looped and the walk stopped early.
   *
   * A loop cannot exist in a healthy plan, and an ancestry walk that did not
   * terminate would hang the command rather than report anything, so it is
   * bounded and the fact is published.
   */
  readonly ancestryLooped: boolean;
}

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
const isDone = (doneAt: string | null | undefined): boolean => doneAt != null;

interface Ancestry {
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
 */
function buildAncestry(byId: ReadonlyMap<string, BlockerTaskRow>): Ancestry {
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

  // Which edges hold which row. Keyed by the id the edge NAMES, so a blocked
  // row's own edges and its ancestors' edges are looked up the same way.
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

  const unready: UnreadyTask[] = [];
  const reconstructedReadyIds: string[] = [];

  for (const task of tasks) {
    if (isDone(task.doneAt)) continue;

    if (!isWork(task)) {
      unready.push({ ...rowOf(task), reason: "CONTENT", blockers: [] });
      continue;
    }
    if (!isWorkLeaf(task)) {
      unready.push({ ...rowOf(task), reason: "STRUCTURE", blockers: [] });
      continue;
    }

    const blockers: HoldingBlocker[] = [];
    const scope = [task.id, ...(chains.get(task.id) ?? [])];
    const seenBlockers = new Set<string>();

    for (const namedId of scope) {
      for (const edge of edgesByBlocked.get(namedId) ?? []) {
        if (seenBlockers.has(edge.blockerTaskId)) continue;
        const blocker = byId.get(edge.blockerTaskId);
        const hold = holdOf(blocker);
        if (hold === null) continue;

        seenBlockers.add(edge.blockerTaskId);
        // Branched on the ROW's absence rather than on a nullish title: an edge
        // pointing outside the plan is a different fact from a row whose title
        // happens to be blank, and a `??` fallback would report the second as
        // the first. A blank title is legal here and is rendered as it is.
        blockers.push(
          blocker === undefined
            ? {
                taskId: edge.blockerTaskId,
                title: "(not in this plan)",
                kind: null,
                isWork: false,
                isStructure: false,
                done: false,
                hold,
                viaAncestorTaskId: namedId === task.id ? null : namedId
              }
            : {
                taskId: blocker.id,
                title: blocker.title,
                kind: blocker.kind,
                isWork: isWork(blocker),
                isStructure: isWork(blocker) && !isWorkLeaf(blocker),
                done: isDone(blocker.doneAt),
                hold,
                viaAncestorTaskId: namedId === task.id ? null : namedId
              }
        );
      }
    }

    if (blockers.length === 0) reconstructedReadyIds.push(task.id);
    else unready.push({ ...rowOf(task), reason: "BLOCKED", blockers });
  }

  return {
    unready,
    reconstructedReadyIds,
    disagreesWithServer: serverReadyTruncated
      ? null
      : !sameSet(reconstructedReadyIds, serverReadyIds),
    ancestryLooped: looped
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
