import type { ScannedLeaf } from "../json-shape.scan";

/**
 * WHICH LEAF A SCANNED REGISTRATION BELONGS TO.
 *
 * ── WHY THE JOIN IS ON THE PATH SUFFIX, NOT ON THE SOURCE MODULE ────────────
 *
 * The scan reads a registration's path RELATIVE to the `Command` its registrar
 * was handed, extended upward through that registrar's call site as far as the
 * source resolves — `role list` for a leaf registered on a handed-in `role`, and
 * no further when the prefix is decided at runtime. The real tree knows the
 * absolute path. So a scanned entry belongs to the leaf whose path ENDS WITH
 * it, taking the longest match: `node get` beats a bare `get`.
 *
 * 🚨 THE SOURCE MODULE IS NOT PART OF THE KEY, AND THAT WAS MEASURED RATHER
 * THAN ASSUMED. A `CommandNode`'s `sourceModule` is the module whose registrar
 * produced the ROOT of its tree, so every `workflow node …` leaf reports
 * `workflow.ts` while its registration is written in `workflow-builder.ts`.
 * Keying on it dropped 68 leaves, including all 21 of `admin vibe-*`.
 *
 * Dropping it is safe here because it was checked in both directions: keying on
 * the module classified 368 leaves, dropping it classified 410, and the two
 * AGREED on all 368 — 0 disagreements. A cross-module join is therefore purely
 * additive on this tree, and an ambiguous longest match is refused rather than
 * guessed.
 */
export function bestMatch(pool: readonly ScannedLeaf[], leafPath: string): ScannedLeaf[] {
  const candidates = pool.filter(
    (entry) => leafPath === entry.relativePath || leafPath.endsWith(` ${entry.relativePath}`)
  );
  if (candidates.length === 0) return [];

  const depth = (entry: ScannedLeaf): number => entry.relativePath.split(" ").length;
  const longest = Math.max(...candidates.map(depth));
  return candidates.filter((entry) => depth(entry) === longest);
}
