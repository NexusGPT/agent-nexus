import fs from "node:fs";

import type { MountRecord } from "../mount-registry";
import { printWarning } from "../output";
import { removeCacheIfEmpty } from "./cache-holds-entries";
import { countPendingUploads } from "./count-pending-uploads";
import { errnoOf } from "./errno-of";
import { isMountId } from "./mount-id";
import { PENDING_UPLOADS_UNKNOWN } from "./pending-uploads-unknown";
import { readSession } from "./read-session";
import { sessionPathsFor } from "./session-paths";

/** What a stopped drive leaves on disk, for the engines that cache. */
export interface MountLeftovers {
  readonly pendingUploads: number;
  /** The expiry of the direct engine's last minted key, which no call can revoke; null when unreadable. */
  readonly accessValidUntil: string | null;
}

/**
 * Delete a direct mount's session directory — the triplet and the
 * credential_process line — and its cache directory ONLY when that holds
 * nothing. rclone re-uploads dirty cache items on its next run with the same
 * cache directory, and `umount` never waits for the write-back, so a cache
 * with anything in it is the only copy of saves that have not reached the
 * workspace: it stays, counted, until `remount` drains it.
 */
export function removeDirectSession(record: MountRecord): MountLeftovers {
  // A corrupt or missing id cleans up nothing: `unmount` is the verb a user
  // reaches for to get OUT of a broken state, so it never throws
  // `sessionPathsFor`'s refusal at them. The count is unknown, never 0: no
  // cache was looked at, and "nothing waits" would be a claim about one.
  if (record.mountId === undefined || !isMountId(record.mountId)) {
    return { pendingUploads: PENDING_UPLOADS_UNKNOWN, accessValidUntil: null };
  }
  const paths = sessionPathsFor(record.mountId);
  const read = readSession(record.mountId);
  // Retried: on Windows an antivirus or a renewal still running holds a file
  // for a moment. Past the retries it is named, never thrown: the drive is
  // already stopped, and a throw would keep the row of a drive that is gone.
  try {
    fs.rmSync(paths.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    printWarning(
      `${paths.dir} could not be removed (${errnoOf(error) ?? "unknown"}).`,
      "Delete it yourself."
    );
  }
  const pendingUploads = countPendingUploads(paths.cacheDir);
  removeCacheIfEmpty(paths.cacheDir);
  return { pendingUploads, accessValidUntil: read.ok ? read.session.expiresAt : null };
}
