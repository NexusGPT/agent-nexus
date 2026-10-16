import type { BaselineLeaf } from "./cli-surface.baseline.model";
import type { DeprecationRecord } from "./deprecations";

/**
 * SHAPE LOOKUPS, SHARED BY BOTH AUDITS.
 *
 * A leaf's SHAPE is its derived identity, and both the removal audit and the
 * record audit have to ask the same two questions of it — which paths carry a
 * shape, and which record names one. Neither tolerates a guess when the answer
 * is ambiguous, which is why both return the ambiguity rather than a best
 * effort.
 */

/** Paths grouped by identity, so a collision is visible rather than assumed away. */
export function byShape(leaves: readonly BaselineLeaf[]): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, string[]>();
  for (const leaf of leaves) {
    const group = index.get(leaf.shape);
    if (group === undefined) index.set(leaf.shape, [leaf.path]);
    else group.push(leaf.path);
  }
  return index;
}

/** The single record for a shape, or `null` when there are none — or more than one. */
export function soleRecord(
  records: readonly DeprecationRecord[],
  shape: string
): DeprecationRecord | null {
  const matches = records.filter((record) => record.shape === shape);
  return matches.length === 1 ? matches[0] : null;
}
