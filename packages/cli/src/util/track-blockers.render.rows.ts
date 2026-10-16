import type { BlockerHold, UnreadyTask } from "./track-blockers";

/**
 * One printed line per (held task, holding row) pair, and the words a hold is
 * rendered in. Separate from the renderer because this is the only place that
 * decides WHAT a reader is told about a blocker; the renderer decides where it
 * goes on screen.
 */

/** What a hold means, in the words a reader can act on. */
const HOLD_TEXT: Readonly<Record<BlockerHold, string>> = {
  OPEN: "open — tick it",
  SUBTREE_OPEN: "subtree open",
  NO_WORK_BENEATH: "no work beneath",
  UNKNOWN_TASK: "not in this plan"
};

/** One printed line: a held task, and one of the rows holding it. */
export interface HoldRow {
  readonly task: string;
  readonly heldBy: string;
  readonly kind: string;
  readonly state: string;
  readonly via: string;
  readonly blockerId: string;
}

export function holdRowsOf(unready: readonly UnreadyTask[]): HoldRow[] {
  const rows: HoldRow[] = [];

  for (const held of unready) {
    if (held.reason !== "BLOCKED") continue;
    for (const blocker of held.blockers) {
      rows.push({
        task: held.title,
        heldBy: blocker.title,
        // The question the report was asked: work, or content nobody will tick.
        kind: blocker.kind === null ? "?" : blocker.isWork ? blocker.kind : `${blocker.kind} ⚑`,
        state: HOLD_TEXT[blocker.hold],
        via: blocker.viaAncestorTaskId ?? "—",
        blockerId: blocker.taskId
      });
    }
  }

  return rows;
}
