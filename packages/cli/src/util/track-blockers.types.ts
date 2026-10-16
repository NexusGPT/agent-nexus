import type { TrackTaskKind } from "@agent-nexus/sdk";

/**
 * THE SHAPES {@link WhyNotReadyReport} IS MADE OF — the two rows this
 * reconstruction reads, and the four it produces.
 *
 * A LEAF: it imports one wire type and nothing else, so the plan index, the
 * hold walk and the renderer can each name a shape without depending on one
 * another. `track-blockers.ts` is the public name for all of them and
 * re-exports every type here under its original path.
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
