import type { SurfaceTier } from "./cli-surface.model";

/**
 * THE TYPES UNDER `cli-surface.baseline.generated.ts` — deliberately
 * dependency-free, for the same reason `cli-surface.model.ts` is: the baseline
 * is a DATA module with one import, and it must not drag the command tree in
 * behind it.
 */

/** One leaf as the LAST RELEASE shipped it. Three fields, because the gate needs three. */
export interface BaselineLeaf {
  /** The path a caller typed at that release. The thing that must keep working. */
  readonly path: string;
  /** The rename-stable identity, so a move is distinguishable from a removal. */
  readonly shape: string;
  /** The tier that governed it THEN — which is the promise that was made about it. */
  readonly tier: SurfaceTier;
}

/**
 * THE PUBLIC SURFACE OF THE LAST RELEASED VERSION.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A SNAPSHOT AND NOT `git show <tag>`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The question the removal gate asks is "what did the last release promise",
 * and git can answer it — until the day it cannot. A CI job on a shallow clone,
 * a fork with no tags, a worktree that has not fetched: each of those turns the
 * gate into a step that SKIPS, and a gate that skips reads exactly like a gate
 * that passed. This package has already been bitten by that class often enough
 * to write it down twice.
 *
 * A committed snapshot is hermetic. It is also a DIFF, which is what the whole
 * surface-manifest design is for: an author who tries to drop a promised leaf
 * sees the row leave this file, and so does a reviewer.
 *
 * ── WHAT `deprecations` IS FOR, AND IT IS THE LOAD-BEARING FIELD ────────────
 *
 * It is the set of `shape`s that were DECLARED DEPRECATED at that release. It
 * exists so a deprecation cannot be invented and spent in one commit.
 *
 * Without it the cycle is walkable in the most obvious way there is: add the
 * record and delete the command in the same pull request, and every field the
 * gate reads is satisfied by text the same author just wrote. With it, a record
 * only becomes spendable once a RELEASE has captured it — which is exactly what
 * "announced one release before" means, expressed as data instead of trust.
 *
 * ── THE ONE THING THIS CANNOT DO ────────────────────────────────────────────
 *
 * 🚨 A HAND-EDIT OF THIS FILE WALKS AROUND THE GATE, and no arrangement of a
 * checked-in file can prevent that. Dropping a row here and deleting the
 * command is a green build. What the design buys is that the walk-around is
 * VISIBLE — it is a deletion from a file whose header says GENERATED, in the
 * same commit as the command it excuses — and that it is the same act as
 * deleting the gate outright, which is the floor of what any gate promises.
 *
 * `scripts/generate-cli-surface-baseline.ts` is the sanctioned way to move this
 * file, and it REFUSES to drop a leaf whose cycle has not been served. So the
 * honest path is blocked at the tool, and the dishonest one is a hand-written
 * diff in a generated file.
 */
export interface SurfaceBaseline {
  /**
   * The package version this snapshot was taken at.
   *
   * ⚠️ THE FIRST SNAPSHOT IS OVER-INCLUSIVE AND THAT IS THE SAFE DIRECTION.
   * `cli-surface.generated.ts` did not exist when 0.26.0 was published, so the
   * first baseline was captured from `staging` and labelled with the version in
   * `package.json`. It therefore holds any leaf added between that publish and
   * the capture — leaves the released binary never carried. The cost is that
   * removing one of those owes a cycle it did not really owe; the alternative
   * error, a baseline missing a leaf that WAS published, silently permits the
   * removal this whole file exists to refuse. A snapshot captured from `staging`
   * rather than at the instant of a publish carries the same over-inclusion, in
   * the same safe direction.
   *
   * 🚨 A SNAPSHOT IS ONLY AS CURRENT AS THE LAST TIME SOMEBODY RAN THE
   * GENERATOR, AND FOR THIRTEEN RELEASES NOBODY DID. This file sat at 0.26.0
   * while the package shipped 0.35.1. Nothing had gone wrong in it — the cost
   * was not a wrong answer but a SMALLER QUESTION. `auditSurfaceRemovals` walks
   * the BASELINE, so the 23 leaves published in between were compared against
   * nothing at all, and any of them could have been deleted with every gate
   * still green. A stale baseline does not weaken the rule; it shrinks the
   * population the rule is asked about, which nothing surfaces on its own.
   *
   * That is now an assertion rather than a habit. `deprecation-cycle.test.ts`
   * counts the `CHANGELOG.md` headings newer than this snapshot and refuses at
   * two or more, naming how many live leaves the lag has put outside the
   * population. The snapshot still lags the tree BETWEEN releases — that is what
   * it is for — and it may lag by the ONE release currently in flight, because
   * `changeset version` bumps the package on a force-pushed branch where a
   * regeneration cannot be committed. What it may not do is lag a release that
   * has already shipped.
   */
  readonly version: string;
  /** Every leaf, sorted by path. */
  readonly leaves: readonly BaselineLeaf[];
  /** The `shape` of every leaf DECLARED DEPRECATED at that release, sorted. */
  readonly deprecations: readonly string[];
}
