import type { MountRecord } from "../../mount-registry";
import {
  type MountLeftovers,
  removeDirectSession
} from "../../workspace-direct-mount/remove-direct-session";
import { removeGatewayCache } from "./gateway-cache";

/**
 * Clean up after the engines that cache: the direct engine's session and
 * cache, the rclone engine's cache folder. Null where nothing is tracked — the
 * webdav engine, and an rclone row mounted before drives had their own folder.
 */
export function removeLeftovers(record: MountRecord): MountLeftovers | null {
  switch (record.engine) {
    case "direct":
      return removeDirectSession(record);
    case "rclone": {
      const pendingUploads = removeGatewayCache(record);
      return pendingUploads === null ? null : { pendingUploads, accessValidUntil: null };
    }
    case "webdav":
      return null;
    default:
      // `readMounts` casts the file, so a hand-edited row can reach here with no
      // engine at all: it has nothing of ours to clean, and the unmount stands.
      record.engine satisfies never;
      return null;
  }
}
