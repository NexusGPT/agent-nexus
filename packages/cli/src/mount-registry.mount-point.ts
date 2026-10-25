import type { MountRecord } from "./mount-registry.model";
import { mountPathKey } from "./workspace-direct-mount/mount-path-key";

/**
 * ONE REGISTRY ROW PER MOUNT POINT, ACROSS EVERY SCOPE.
 *
 * Scoping the KEY does not scope the mount POINT. The default mount point is
 * `~/nexus/<org>/<slug>` (`defaultMountPath`), so two orgs mounting one slug
 * land in two directories by default — but `--at` names any path, rows written
 * before the org segment existed sit at `~/nexus/<slug>`, and two orgs whose
 * names slugify alike share a segment. `claimMountPoint` holds the invariant the
 * key alone cannot — one registry row per mount point, across every scope — so a
 * clash is refused with `--at <path>` named instead of silently stacking a mount,
 * and unmounting one org's row can never detach another org's live drive.
 */

/**
 * Every recorded mount whose mount POINT is `mountPath`, excluding `exceptKey`
 * (the caller's own row, which it handles itself).
 *
 * Registry keys are org-scoped (NEX-2360); mount points are not. `--at` names
 * any directory, rows written before the default carried an org segment sit at
 * `~/nexus/<slug>`, and a scope-filtered `findMount` never sees another org's
 * row on the same path. Two rows naming one mount point
 * corrupt each other: every OS-level action keys off `mountPath`, so unmounting
 * one row detaches whatever is mounted there — including another org's live
 * drive — and a webdav row reads "live" merely because the OTHER org's mount
 * owns its path. Callers use this to hold the invariant: one row per mount
 * point, whatever the scope.
 *
 * Paths are compared by `mountPathKey` — `path.resolve`, and on Windows case
 * folded — so a trailing slash, a relative `--at` or another spelling of the
 * same Windows folder still recognises the same directory. Rows with no usable
 * `mountPath` (hand-edited registry) are skipped rather than crashing the compare.
 */
export function findMountsByPath(
  mounts: Record<string, MountRecord>,
  mountPath: string,
  exceptKey?: string
): { key: string; record: MountRecord }[] {
  const target = mountPathKey(mountPath);
  return Object.entries(mounts)
    .filter(
      ([key, r]) =>
        key !== exceptKey &&
        typeof r?.mountPath === "string" &&
        r.mountPath.length > 0 &&
        mountPathKey(r.mountPath) === target
    )
    .map(([key, record]) => ({ key, record }));
}

/** Verdict on whether a mount point can be claimed for a new mount. */
export interface MountPointClaim {
  /** A LIVE mount recorded by another row already owns the path — refuse. */
  blockedBy?: { key: string; record: MountRecord };
  /** Dead rows naming the path; drop them as the new mount takes it over. */
  stale: { key: string; record: MountRecord }[];
}

/**
 * Decide whether `mountPath` can be used for a new mount, given every row in
 * the registry (not just the acting org's — mount points are machine-global).
 *
 * - A live row on the path blocks the mount: mounting on top of it would stack
 *   two drives on one directory and leave two registry rows pointing at it, so
 *   unmounting either would detach the other's live mount.
 * - A dead row on the path is reported as `stale`. It describes nothing real
 *   any more, and left in place it would come to describe the NEW mount — a
 *   later `unmount` of that row would detach a drive it never mounted.
 *
 * `isLive` is injected so this stays pure and testable; the CLI passes its
 * engine-aware liveness probe.
 */
export function claimMountPoint(
  mounts: Record<string, MountRecord>,
  mountPath: string,
  opts: { exceptKey?: string; isLive: (record: MountRecord) => boolean }
): MountPointClaim {
  const stale: { key: string; record: MountRecord }[] = [];
  for (const hit of findMountsByPath(mounts, mountPath, opts.exceptKey)) {
    // A live claimant is fatal, so don't offer stale rows for deletion too —
    // the caller mutates nothing on the blocked path.
    if (opts.isLive(hit.record)) return { blockedBy: hit, stale: [] };
    stale.push(hit);
  }
  return { stale };
}
