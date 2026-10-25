import path from "node:path";

import { failure } from "../../../errors";
import { errnoOf } from "../../../workspace-direct-mount/errno-of";
import { renameWhileHeld } from "../../../workspace-direct-mount/write-session";

/**
 * One atomic rename, retried while an antivirus scans the fresh file (it
 * clears in that time); a running rclone.exe holding its image does not, and
 * is refused as in use.
 */
export function renameOntoManaged(extracted: string, target: string): void {
  try {
    renameWhileHeld(extracted, target);
  } catch (error) {
    const code = errnoOf(error);
    if (code !== "EPERM" && code !== "EBUSY") throw error;
    throw failure(
      "local-failed",
      `${path.basename(target)} is in use, so the new copy could not replace it.`,
      "Unmount every Nexus drive (nexus workspace unmount <slug>), then mount again."
    );
  }
}
