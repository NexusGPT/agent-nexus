import type { VibeLogLineDto } from "../../../vibe-wire-types";

/**
 * A page arrives NEWEST FIRST; a terminal reads oldest first.
 *
 * Reversed for display so time runs down the screen the way `tail` has taught
 * everyone to expect, and so a page followed by `--follow` output is one
 * continuous chronology instead of a reversal followed by a forward run. The
 * wire order is untouched — this is a rendering decision and `nextCursor` paging
 * is unaffected, since a read asks for one page.
 *
 * `--json` gets the same order for the same reason: the whole point of emitting
 * NDJSON in both modes is that what you see and what you pipe do not disagree.
 */
export function orderForDisplay(lines: readonly VibeLogLineDto[]): VibeLogLineDto[] {
  return [...lines].reverse();
}
