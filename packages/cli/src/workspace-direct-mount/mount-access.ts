import type { MountAccess } from "../mount-registry";

/** Every grade, ranked — the gate below and `accessIsLower` read one table. */
const ACCESS_RANK = { read: 0, "read-write": 1 } as const satisfies Record<MountAccess, number>;

export function isMountAccess(value: unknown): value is MountAccess {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCESS_RANK, value);
}

/**
 * True when a re-mint granted less than the mount was made with. Serving
 * `read` credentials under a read-write mount is the silent-loss shape:
 * rclone's write cache accepts the save and drops it at upload.
 */
export function accessIsLower(minted: MountAccess, recorded: MountAccess): boolean {
  return ACCESS_RANK[minted] < ACCESS_RANK[recorded];
}
