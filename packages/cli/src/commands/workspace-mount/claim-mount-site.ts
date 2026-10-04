import {
  alreadyMountedMessage,
  claimMountPoint,
  findMount,
  type MountPointClaim,
  mountPointTakenMessage,
  type MountRecord,
  type MountScope
} from "../../mount-registry";
import { isMountLive } from "./is-mount-live";

/** The dead rows this mount takes over, and the row it replaces. */
export interface MountSite {
  readonly existing: { key: string; record: MountRecord } | undefined;
  readonly claim: MountPointClaim;
}

/**
 * Refuse a mount whose slug, or whose PATH, is already live.
 *
 * Guard scoped to this org only: a second org mounting the same slug
 * at a different path must succeed (NEX-2360). findMount matches the
 * active scope's own entries (incl. a pre-drift or legacy bare-slug
 * mount of this slug) but never another org's, so a still-live mount
 * blocks a duplicate while cross-org mounts stay independent. The
 * error names the owning org/profile so a real conflict is actionable.
 *
 * The guard above is org-scoped; the mount POINT is not. `--at` names
 * any directory, rows written before the default carried an org
 * segment sit at `~/nexus/<slug>`, and another org's row there is
 * invisible to the scoped lookup above. Two rows naming one mount
 * point corrupt each other: every OS action keys off `mountPath`, so
 * `unmount` under org A would detach org B's live drive there. Check
 * the path across ALL scopes; the stale rows this reports are dropped
 * below, as we take the path over.
 */
export function claimMountSite(
  mounts: Record<string, MountRecord>,
  slug: string,
  scope: MountScope,
  mountPath: string
): MountSite {
  const existing = findMount(mounts, slug, scope);
  if (existing && isMountLive(existing.record)) {
    // A row naming no org may belong to a different organization, so
    // "unmount it first" would be an instruction to detach someone
    // else's live drive. `alreadyMountedMessage` owns which of the three
    // remedies fits, beside the other mount texts a test can assert.
    throw new Error(alreadyMountedMessage(slug, existing.record, scope));
  }

  const claim = claimMountPoint(mounts, mountPath, {
    exceptKey: existing?.key,
    isLive: isMountLive
  });
  if (claim.blockedBy) {
    throw new Error(mountPointTakenMessage(mountPath, claim.blockedBy.record, slug));
  }

  return { existing, claim };
}
