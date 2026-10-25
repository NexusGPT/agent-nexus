import fs from "node:fs";
import path from "node:path";

import { filesUnder } from "./files-under";

/**
 * Delete a cache folder only when it holds no item at all. The delete retries
 * a busy folder (an rclone still exiting, an antivirus scan), and a folder
 * that still will not go is left: it is empty, so leaving it costs nothing,
 * while a throw here would fail an unmount that has already stopped the drive.
 */
export function removeCacheIfEmpty(cacheDir: string): void {
  if (cacheHoldsEntries(cacheDir)) return;
  try {
    fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
    /* an empty folder left behind; the next unmount or mount tries again */
  }
}

/** True while the cache holds any item at all — the state `unmount` never deletes. */
export function cacheHoldsEntries(cacheDir: string): boolean {
  return ["vfs", "vfsMeta"].some((tree) => {
    try {
      return filesUnder(path.join(cacheDir, tree)).length > 0;
    } catch {
      // Present and unreadable: the cache is not known to be empty, so it stays.
      return true;
    }
  });
}
