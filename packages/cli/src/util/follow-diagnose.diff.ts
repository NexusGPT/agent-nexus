import type { FollowEntry } from "./follow-diagnose.model";

/** A change signature for an entry — when this differs, we reprint the line. */
export function entrySignature(e: FollowEntry): string {
  return [
    e.status,
    e.duration == null ? "" : "d",
    e.outputSummary ?? "",
    e.error ?? "",
    e.loopProgress ? `${e.loopProgress.done}/${e.loopProgress.total ?? "?"}` : ""
  ].join("|");
}

/**
 * Compare a new set of entries against the previous signature map and return
 * the entries whose state changed (new nodes included), in order, plus the
 * updated signature map to carry into the next poll.
 */
export function diffSnapshots(
  prev: Map<string, string>,
  entries: FollowEntry[]
): { changed: FollowEntry[]; next: Map<string, string> } {
  const next = new Map<string, string>();
  const changed: FollowEntry[] = [];
  for (const e of entries) {
    const sig = entrySignature(e);
    next.set(e.key, sig);
    if (prev.get(e.key) !== sig) changed.push(e);
  }
  return { changed, next };
}
