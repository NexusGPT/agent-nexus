/**
 * What the report may claim when it found NO hold at all.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 AN EMPTY HOLD TABLE IS ONLY EVIDENCE OF "NOTHING HOLDS" IF THE WALK FINISHED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The rows are derived from the ancestry chains, and `buildAncestry` BREAKS out
 * of a chain that revisits a node. An incomplete ancestor list can only MISS a
 * hold — it never invents one — so "the walk found nothing" and "there is
 * nothing" produce the identical empty table. `ancestryLooped` is the only thing
 * that separates them, and the sentence used to be printed without consulting it.
 *
 * ⚠️ THE EXISTING CAVEAT DID NOT COVER THIS, AND READS AS THOUGH IT DOES. The
 * loop warning `renderWhyNotReady` prints says "Some rows below may be explained
 * against an incomplete ancestor list" — and this is the branch with NO rows
 * below. It qualified every case except the one where the claim was strongest.
 *
 * The truncated wording is ASD-STE100 Simplified Technical English: active voice,
 * simple present, one idea per sentence, and no claim of a negative the walk
 * cannot establish. It states what the report SHOWS, never what EXISTS.
 *
 * 🚨 `ancestryLooped === false` IS NOT A PROOF THAT THE WALK WAS COMPLETE, and
 * this wording is chosen so it does not imply one. `buildAncestry` has a second
 * exit — `if (parent === undefined) break` — which truncates a chain when a
 * `parentTaskId` names a row absent from the supplied set, and it sets no flag.
 * That is reachable whenever the task list itself was capped. Closing it needs a
 * second flag out of `buildAncestry`, which is a wider change than this one.
 */
export function emptyHoldLine(ancestryLooped: boolean, readySetIsEmpty: boolean): string {
  if (!ancestryLooped) {
    // Unchanged, byte for byte: when the walk completed, the original claim is
    // the one the report is entitled to make.
    return readySetIsEmpty
      ? "No open work leaf is held by an edge. Nothing is being withheld by a dependency."
      : "Nothing is held by an edge — the ready set is not empty.";
  }

  const shown = "This report shows no work leaf that an edge holds.";
  const truncated = "The ancestry walk stopped early. This result can be incomplete.";

  return readySetIsEmpty
    ? `${shown} ${truncated}`
    : `${shown} ${truncated} The ready set is not empty.`;
}
