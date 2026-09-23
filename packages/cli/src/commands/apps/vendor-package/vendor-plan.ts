/**
 * The vocabulary of a vendoring plan: what the planners read, and what they
 * produce.
 *
 * Its own file because three planners and two appliers all speak it, and any
 * one of them owning it would make the other four import from a peer for a
 * reason that has nothing to do with that peer's behaviour.
 */

import type { NPM_LOCKFILE_NAMES } from "@nexus/vibe-app-vendoring";

/** Everything the plan reads. `null` means the file is not there. */
export interface AppFiles {
  readonly packageJson: string;
  /** The EFFECTIVE lockfile — the first of {@link NPM_LOCKFILE_NAMES} present. */
  readonly lockfile: { readonly name: string; readonly raw: string } | null;
  readonly dockerfile: string | null;
  /** Filenames already in `vendor/`, so a superseded tarball can be removed. */
  readonly vendorEntries: readonly string[];
}

export interface VendorWrite {
  /** App-relative path. */
  readonly path: string;
  readonly content: string;
}

export interface VendorPlan {
  readonly writes: readonly VendorWrite[];
  /** App-relative paths to delete — a superseded tarball of the SAME package. */
  readonly removals: readonly string[];
  /** Lines to show the user. Each names something they may have to act on. */
  readonly warnings: readonly string[];
  /** What the user must run next for the tree to be consistent. */
  readonly nextCommand: "npm install" | "npm ci";
}

export type VendorPlanOutcome = { ok: true; plan: VendorPlan } | { ok: false; reason: string };

/** One planner's contribution to the whole. */
export interface Leg {
  readonly writes: readonly VendorWrite[];
  readonly warnings: readonly string[];
}
