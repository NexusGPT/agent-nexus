import type { SurfaceLeaf } from "./cli-surface.model";

/**
 * WHAT ONE PROJECTION OF THE SURFACE CARRIES, plus the two rendered absences a
 * row can hold.
 *
 * Split out of `cli-surface.project.ts` so the walk, the encoders and the module
 * text can each name this shape without importing one another. Nothing here
 * imports a sibling of that family back, so the re-export index stays acyclic.
 */

/** The `--json` envelope a leaf prints, or the honest absence. */
export const ABSTAINS = "(abstains)" as const;

/**
 * A leaf `COMMAND_CLASSIFICATION` does not name — the state a NEW command is in
 * before anyone declares its disposition. Rendered, never crashed on, and never
 * silently defaulted to a real disposition: guessing `registration-only` here
 * would put a plausible word in a review artefact that nobody declared.
 */
export const UNCLASSIFIED = "(unclassified)" as const;

export interface Projection {
  /** Every invocable leaf, sorted by path. */
  readonly leaves: readonly SurfaceLeaf[];
  /** Options declared on the ROOT program — global, and STABLE by `COMPATIBILITY.md`. */
  readonly globals: readonly string[];
  /** Every node in the tree, leaves and namespaces alike. Sizes the tree. */
  readonly nodeCount: number;
  /** Top-level commands, and how many of those are hidden. */
  readonly topLevel: { readonly total: number; readonly visible: number; readonly hidden: number };
  /**
   * Leaves the root-program walk does not carry, by path. Reported rather than
   * dropped: an empty list is the CLAIM the spec checks, not a fact assumed here.
   */
  readonly unjoined: readonly string[];
  /**
   * Shapes shared by more than one leaf, each naming its members. The manifest's
   * rename signal cannot separate the leaves inside a group, and a reader must be
   * told which those are rather than discovering it during a review.
   */
  readonly shapeCollisions: readonly (readonly string[])[];
}
