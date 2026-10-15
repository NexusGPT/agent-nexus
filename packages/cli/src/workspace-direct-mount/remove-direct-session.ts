import fs from "node:fs";

import type { MountRecord } from "../mount-registry";
import { cacheHoldsEntries } from "./cache-holds-entries";
import { countPendingUploads } from "./count-pending-uploads";
import { isMountId } from "./mount-id";
import { readSession } from "./read-session";
import { sessionPathsFor } from "./session-paths";

/** What a direct mount leaves behind once its session directory is gone. */
export interface DirectLeftovers {
  readonly pendingUploads: number;
  /** The expiry of the last minted key, which no call can revoke; null when unreadable. */
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
export function removeDirectSession(record: MountRecord): DirectLeftovers {
  // A corrupt id is treated like an absent one: `unmount` is the verb a user
  // reaches for to get OUT of a broken state, so it degrades to "nothing to
  // clean up" rather than throwing `sessionPathsFor`'s refusal at them.
  if (record.mountId === undefined || !isMountId(record.mountId)) {
    return { pendingUploads: 0, accessValidUntil: null };
  }
  const paths = sessionPathsFor(record.mountId);
  const read = readSession(record.mountId);
  fs.rmSync(paths.dir, { recursive: true, force: true });
  const pendingUploads = countPendingUploads(paths.cacheDir);
  if (!cacheHoldsEntries(paths.cacheDir)) {
    fs.rmSync(paths.cacheDir, { recursive: true, force: true });
  }
  return { pendingUploads, accessValidUntil: read.ok ? read.session.expiresAt : null };
}
