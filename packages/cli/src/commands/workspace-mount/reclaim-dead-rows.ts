import { describeOwner, type MountPointClaim, type MountRecord } from "../../mount-registry";
import { printWarning } from "../../output";
import { retireDeadRow } from "./plan-mount";

/**
 * Retire a dead row of ANOTHER scope that names this mount point: it describes
 * nothing live, and left in place it would come to describe OUR mount — a later
 * unmount of that row would detach a drive it never mounted. Deleted only in
 * memory here; the registry file is untouched unless the mount actually
 * succeeds. Its mount id is not ours, so no plan uploads its unsent saves: the
 * refusal over them needs no plan, and comes before any install is offered.
 */
export function reclaimStaleRows(
  mounts: Record<string, MountRecord>,
  claim: MountPointClaim,
  mountPath: string
): void {
  for (const dead of claim.stale) {
    printWarning(
      `Reclaiming ${mountPath} from a stale mount record ` +
        `(${describeOwner(dead.record)}, workspace "${dead.record.slug}").`,
      "That mount is no longer live, so its registry entry is being replaced."
    );
    retireDeadRow(mounts, dead, null, false);
  }
}
