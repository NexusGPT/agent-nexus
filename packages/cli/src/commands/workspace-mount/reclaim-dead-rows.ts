import { describeOwner, type MountPointClaim, type MountRecord } from "../../mount-registry";
import { printWarning } from "../../output";
import type { MountPlan } from "./mount-plan";
import { retireDeadRow } from "./plan-mount";

/** Retire the rows this mount replaces — its own, and any dead row on the path. */
export function reclaimDeadRows(
  mounts: Record<string, MountRecord>,
  existing: { key: string; record: MountRecord } | undefined,
  claim: MountPointClaim,
  plan: MountPlan,
  mountPath: string
): void {
  // Drop a stale prior row (possibly under a legacy bare-slug or
  // pre-drift key) so we don't leave a duplicate entry for this same
  // workspace + org — legacy records migrate to a scoped key here.
  // Same for a dead row of ANOTHER scope that names this mount point:
  // it describes nothing live, and left in place it would come to
  // describe OUR mount — a later unmount of that row would detach a
  // drive it never mounted. Deleted only in memory here; the registry
  // file is untouched unless the mount below actually succeeds. A dead
  // DIRECT row is retired first: its unsent saves refuse a replacement
  // that would not upload them, and its session goes with it.
  if (existing) retireDeadRow(mounts, existing, plan);
  for (const dead of claim.stale) {
    printWarning(
      `Reclaiming ${mountPath} from a stale mount record ` +
        `(${describeOwner(dead.record)}, workspace "${dead.record.slug}").`,
      "That mount is no longer live, so its registry entry is being replaced."
    );
    retireDeadRow(mounts, dead, plan);
  }
}
