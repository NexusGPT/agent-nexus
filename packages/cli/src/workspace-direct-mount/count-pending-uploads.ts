import fs from "node:fs";
import path from "node:path";

import { filesUnder } from "./files-under";
import { isRecord } from "./is-record";
import { PENDING_UPLOADS_UNKNOWN } from "./pending-uploads-unknown";

// rclone keeps one metadata file per cached item under `<cacheDir>/vfsMeta`,
// with `Dirty: true` on an item whose bytes are not yet uploaded, and re-uploads
// those on its next run with the same cache directory and the same remote
// definition. `umount` never waits for that write-back, so what the cache holds
// after a mount ends is the only record of saves that have not reached the
// workspace — which is why `unmount` reads it before deciding what to delete.

/**
 * An item whose metadata says `Dirty`, or whose metadata cannot be read at
 * all: an unreadable record is counted rather than dropped, because the cost
 * of the two mistakes is not symmetric — an over-count keeps a cache directory,
 * an under-count deletes a save.
 */
function itemIsPending(metaFile: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
  } catch {
    return true;
  }
  return isRecord(parsed) && parsed.Dirty === true;
}

/**
 * How many cached items are still waiting to upload. Zero when the cache is
 * ABSENT; {@link PENDING_UPLOADS_UNKNOWN} when it is there and cannot be read.
 *
 * The unknown answer exists so a caller cannot mistake "I could not look" for
 * "there is nothing there" — the mistake that ends in a deleted save.
 */
export function countPendingUploads(cacheDir: string): number {
  try {
    return filesUnder(path.join(cacheDir, "vfsMeta")).filter(itemIsPending).length;
  } catch {
    return PENDING_UPLOADS_UNKNOWN;
  }
}
