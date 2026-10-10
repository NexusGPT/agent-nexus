/**
 * THE REPORT CONTRACT — the shape `classify.ts` returns and `sweep.sh` reads.
 *
 * A type and no code, so a consumer can name the shape without importing the
 * whole classification table or the commander tree walk that produces it.
 *
 * WHAT BELONGS HERE: `DriftReport` and the per-field argument for why each list
 * exists separately — several of them are subsets of `safe` and the docblocks
 * say what would break if they were merged or flagged instead.
 *
 * WHAT DOES NOT: the derivation. Adding a field here means adding the arm in
 * `classify.ts` that fills it; a field nothing fills is a list every caller
 * reads as empty.
 */

import type { SweepPendingDeployRoute } from "../sweep-routes-pending-deploy";

export interface DriftReport {
  /** Leaves in the tree that {@link COMMAND_CLASSIFICATION} does not name. */
  readonly unclassified: readonly string[];
  /** Paths classified here that no longer exist in the tree. */
  readonly stale: readonly string[];
  /**
   * What `sweep.sh` EXECUTES, in tree order — `safe` and `safe-with-fixture`
   * together. One list, because the two are executed identically; they differ
   * only in what is asserted about the answer.
   */
  readonly safe: readonly string[];
  /**
   * The subset of {@link safe} whose response must not be empty.
   *
   * A separate list rather than a flag on each entry because `sweep.sh` reads
   * it: bash has no record type, and a second `--print-*` mode it can read line
   * by line is the whole interface.
   */
  readonly fixtureBacked: readonly string[];
  /**
   * The subset of {@link safe} whose SKIP the sweep accepts — see
   * {@link SWEEP_EXPECTED_SKIPS}. Any other skip is a failure.
   */
  readonly expectedSkips: readonly string[];
  /**
   * Paths declared in {@link SWEEP_EXPECTED_SKIPS} that the sweep does not
   * execute — renamed, deleted, or reclassified away from `safe`.
   *
   * Drift, exactly like {@link stale}: a declaration nothing can consume is an
   * accepted skip for a leaf that no longer exists, and it would sit there
   * excusing a future leaf that happens to reuse the name.
   */
  readonly staleExpectedSkips: readonly string[];
  /**
   * The subset of {@link safe} whose route the deployed API cannot serve yet —
   * see {@link SWEEP_ROUTES_PENDING_DEPLOY}.
   *
   * Each entry carries its leaf path alongside the declaration, because
   * `sweep.sh` needs the pairing: membership alone would tell it a leaf is
   * declared without telling it WHICH absence is accepted, and an unbound
   * matcher would then accept any 404 at all.
   */
  readonly pendingDeploy: readonly (SweepPendingDeployRoute & { readonly path: string })[];
  /**
   * Paths declared in {@link SWEEP_ROUTES_PENDING_DEPLOY} that the sweep does not
   * execute — renamed, deleted, or reclassified away from `safe`.
   *
   * Drift, exactly like {@link staleExpectedSkips}. A declaration nothing can
   * consume would sit there accepting a 404 on behalf of a leaf that no longer
   * exists, and would accept it for whatever later takes that name.
   */
  readonly stalePendingDeploy: readonly string[];
  /** Every leaf the tree currently has. */
  readonly observed: readonly string[];
}
