import type { BaselineLeaf, SurfaceBaseline } from "./cli-surface.baseline.model";
import type { DeprecationRecord } from "./deprecations";

/**
 * ADVANCING THE BASELINE: the next manifest, and the one document figure that
 * has to move with it.
 *
 * Both exports are pure. The refusal lives in the caller —
 * `scripts/generate-cli-surface-baseline.ts` — which runs the audits first.
 */

/**
 * Build the next baseline from a projected surface. Pure — the refusal lives in
 * the caller.
 *
 * 🚨 A RECORD IS CARRIED FORWARD ONLY WHILE ITS LEAF IS STILL PROMISED, AND
 * DROPPING THAT FILTER DEADLOCKS THE RELEASE AFTER EVERY SUCCESSFUL REMOVAL.
 *
 * Carrying every declared record would re-capture the TOMBSTONE of a leaf that
 * has just been removed. Then: `auditDeprecationRecords` demands the spent record
 * be deleted, because its shape is in neither the surface nor the baseline's
 * leaves — and deleting it makes the committed baseline disagree with this
 * function, while keeping it leaves a permanent violation. Neither order reaches
 * a green tree.
 *
 * A deprecation set is a statement about leaves this baseline PROMISES. A record
 * whose leaf is gone has been spent; it is not re-promised, and the hygiene rule
 * then asks for its deletion exactly once, at the one moment deleting it is safe.
 */
export function nextBaseline(input: {
  readonly version: string;
  readonly leaves: readonly BaselineLeaf[];
  readonly records: readonly DeprecationRecord[];
}): SurfaceBaseline {
  const promised = new Set(input.leaves.map((leaf) => leaf.shape));

  return {
    version: input.version,
    leaves: [...input.leaves]
      .map((leaf) => ({ path: leaf.path, shape: leaf.shape, tier: leaf.tier }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    deprecations: [
      ...new Set(input.records.map((record) => record.shape).filter((shape) => promised.has(shape)))
    ].sort()
  };
}

/**
 * The one sentence in `COMPATIBILITY.md` whose second figure is DERIVED FROM THE
 * BASELINE rather than from the command tree.
 *
 * `compatibility-figures.test.ts` pins it to `CLI_SURFACE_BASELINE.leaves.length`
 * by this same shape. Both capture groups are numbers that spec checks; only the
 * second one moves when the baseline advances, which is why the first is matched
 * and not captured for replacement here — the first is `DEPRECATIONS.length`, a
 * hand-authored count this module has no business rewriting.
 */
const PROMISED_PATHS_SENTENCE =
  /(\*\*\d+ leaves are on a deprecation cycle today\*\*, out of the \*\*)(\d+)( paths\*\*)/g;

/**
 * COMPATIBILITY.md's promised-path figure, retargeted to a baseline.
 *
 * 🚨 WHY THIS IS PART OF THE BASELINE WRITE AND NOT A SEPARATE CHORE. The figure
 * is a statement about the baseline, so advancing one without the other leaves a
 * tree that is internally inconsistent — and NOTHING NAMES THE DOCUMENT until
 * `compatibility-figures.test.ts` reds on a later run, in a file the author of the
 * advance never opened. Every hand advance so far has had to discover that
 * coupling for itself.
 *
 * Returns `null` — never the input unchanged — when the sentence is not found
 * exactly once. An absent sentence and a satisfied one are the same bytes to a
 * blind rewrite, so a caller that took the text back would write a baseline whose
 * document silently disagrees with it. Refusing is the only answer that cannot be
 * mistaken for success.
 */
export function retargetCompatibilityFigures(
  doc: string,
  baseline: SurfaceBaseline
): string | null {
  const matches = [...doc.matchAll(PROMISED_PATHS_SENTENCE)];
  if (matches.length !== 1) return null;

  return doc.replace(
    PROMISED_PATHS_SENTENCE,
    (_whole, before: string, _figure: string, after: string) =>
      `${before}${baseline.leaves.length}${after}`
  );
}
