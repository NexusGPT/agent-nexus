import type { MountRecord } from "../../../mount-registry";
import {
  type DirectMountHealth,
  directMountHealth
} from "../../../workspace-direct-mount/direct-mount-health";
import { isMountId } from "../../../workspace-direct-mount/mount-id";
import { remountFix } from "../../../workspace-direct-mount/remount-fix";

/**
 * One direct row's renewal health, or the `broken` verdict a registry row
 * this CLI cannot trust produces.
 */
export function directHealthOf(
  record: MountRecord,
  profileExists: (name: string) => boolean,
  now: Date
): DirectMountHealth {
  // 🔴 THE SHAPE, NOT ONLY THE PRESENCE. `readMounts` parses and casts, so
  // `mountId` is a claim about a JSON file — and `sessionPathsFor` THROWS on a
  // malformed one, deliberately, because two of its paths are handed to a
  // recursive delete. That throw escapes the row's own `.map()` and takes the
  // whole command with it, so ONE corrupt row printed a generic error and NONE
  // of the caller's healthy mounts. Worse, its message names `workspace status`
  // as the way to check — the command it just killed. A bad row is a broken ROW.
  if (record.mountId === undefined || !isMountId(record.mountId)) {
    return {
      verdict: {
        kind: "broken",
        what:
          record.mountId === undefined
            ? "mount id missing from the registry row"
            : `mount id "${record.mountId}" in the registry row is not 16 hex digits`,
        fix: remountFix(record.slug)
      },
      expiresAt: null,
      pendingUploads: 0
    };
  }
  return directMountHealth({ mountId: record.mountId, slug: record.slug, profileExists, now });
}
