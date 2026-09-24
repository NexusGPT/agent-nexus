import type { VibeDeploymentDto } from "../../../vibe-deployment-wire-types";
import type { WatchDeploymentStatus } from "../watch/watch-deployment-status";

/**
 * The one status a rollback target may hold.
 *
 * Typed as {@link WatchDeploymentStatus} rather than a bare string so a rename
 * in the schema's mirrored union is a compile error here, instead of this
 * constant quietly matching nothing and every version reading as unrestorable.
 *
 * Only SUPERSEDED, and that is the server's rule rather than this file's:
 * `RollbackVibeDeploymentUseCase` hands the target to `beginRestore()`, whose
 * state machine refuses anything else. A SUPERSEDED row is the only one that
 * both SERVED traffic and kept its image — which is why DISPLACED, whose
 * schema comment spells out that "nothing ever verified it", is not a restore
 * candidate however healthy its image looks.
 */
export const RESTORABLE_STATUS: WatchDeploymentStatus = "SUPERSEDED";

/**
 * The status of the version currently taking traffic.
 *
 * Checked BEFORE the restorable check, and the order is load-bearing rather
 * than cosmetic — see `resolve-rollback-target-by-version.ts`.
 */
export const SERVING_STATUS: WatchDeploymentStatus = "HEALTHY";

/**
 * A deployment that could be rolled back to right now: superseded, and its
 * retained image still recorded.
 *
 * The `imageRef` half mirrors the server's `target-not-placeable` guard. The
 * auto-pick path never meets an imageless SUPERSEDED row because its finder
 * filters them out; an explicitly named target is looked up by id alone, so the
 * check has to exist wherever the target is named — there, and here.
 */
export function isRestorable(deployment: VibeDeploymentDto): boolean {
  return deployment.status === RESTORABLE_STATUS && deployment.imageRef !== "";
}
