import path from "node:path";

import { failure } from "../../errors";
import { describeOwner, type MountRecord, STATE_DIR } from "../../mount-registry";
import { printWarning } from "../../output";
import { removeCacheIfEmpty } from "../../workspace-direct-mount/cache-holds-entries";
import { countPendingUploads } from "../../workspace-direct-mount/count-pending-uploads";
import { discardPendingSavesHint } from "../../workspace-direct-mount/discard-pending-saves-hint";
import { isMountId, type MountId } from "../../workspace-direct-mount/mount-id";
import {
  describePendingUploads,
  PENDING_UPLOADS_UNKNOWN
} from "../../workspace-direct-mount/pending-uploads-unknown";
import { remountFix } from "../../workspace-direct-mount/remount-fix";
import { corruptRowRefusal, recordedMountId } from "./recorded-mount-id";

// ── The rclone engine's cache: one folder per drive and copy ──────────────────
//
// A save on an rclone-engine drive lands in rclone's VFS cache first and
// uploads to the gateway after; until then the cache is its only copy. Each
// drive names its own folder (`--cache-dir`), so this CLI can count what is
// still waiting there — with the direct engine's own counter — while rclone
// runs and after it died.
//
// The folder is keyed by the drive's mount id AND by which copy of the slug it
// mounts. rclone files its cache under a name hashed from its remote (the
// gateway URL, which is `_shared/<slug>` for the admin-shared copy, and the
// key), and drains only what it filed there: one folder for both copies would
// count the other copy's saves as this drive's, and report them uploading
// when nothing ever uploads them. Kept apart from the direct engine's `cache/`
// for the same reason.
//
// A row with no `mountId` was mounted before drives had their own folder:
// rclone cached in its default place, which this CLI does not read, so its
// count is null ("not tracked"), never 0.

/** Where each rclone-engine drive keeps its VFS cache — under the 0700 state tree. */
export const GATEWAY_CACHE_DIR = path.join(STATE_DIR, "gateway-cache");

/** Which cache folder an rclone-engine drive runs on. */
export interface GatewayCache {
  readonly mountId: MountId;
  /** True for the admin-shared copy of the slug, whose gateway URL differs. */
  readonly shared: boolean;
}

export function gatewayCacheDirFor(cache: GatewayCache): string {
  return path.join(GATEWAY_CACHE_DIR, cache.shared ? `${cache.mountId}-shared` : cache.mountId);
}

/** Said once, where a drive from before its own folder is mounted again. */
function warnSavesLeftInDefaultCache(slug: string): void {
  printWarning(
    `"${slug}" last ran before rclone drives had their own cache folder: saves it had not uploaded stay in ` +
      "rclone's default cache folder (~/.cache/rclone on Linux, %LocalAppData%\\rclone on Windows), " +
      "and this mount does not upload them."
  );
}

/**
 * The mount id a remount of an rclone row runs on: the row's own, or the key's
 * for a row that recorded none — saying what that leaves behind. Throws the
 * corrupt-row refusal for an id that is not one.
 */
export function gatewayMountIdOfRow(record: MountRecord, registryKey: string): MountId {
  if (record.mountId === undefined) warnSavesLeftInDefaultCache(record.slug);
  return recordedMountId(record, registryKey);
}

/**
 * The cache folder of an rclone-engine row, `"corrupt"` when the row names an
 * id that is not one, and null for every other row and a row mounted before
 * drives had their own folder. The folder is a field, because a bare string
 * beside `"corrupt"` is one type and a caller could skip the check.
 */
function cacheDirOfRow(record: MountRecord): { readonly dir: string } | "corrupt" | null {
  if (record.engine !== "rclone" || record.mountId === undefined) return null;
  if (!isMountId(record.mountId)) return "corrupt";
  return { dir: gatewayCacheDirFor({ mountId: record.mountId, shared: record.shared === true }) };
}

/**
 * How many saves on an rclone-engine drive have not reached the workspace:
 * null when the row keeps no cache of ours; unknown when the row's id is
 * corrupt, because "I could not look" is never "nothing is waiting".
 */
export function gatewayPendingUploads(record: MountRecord): number | null {
  const cache = cacheDirOfRow(record);
  if (cache === null) return null;
  if (cache === "corrupt") return PENDING_UPLOADS_UNKNOWN;
  return countPendingUploads(cache.dir);
}

/**
 * After an rclone-engine drive stopped: count its unsent saves, and delete its
 * cache folder only when the folder holds nothing at all. Anything in it stays
 * for the next mount of the same row and copy, which uploads it.
 */
export function removeGatewayCache(record: MountRecord): number | null {
  const cache = cacheDirOfRow(record);
  if (cache === null) return null;
  if (cache === "corrupt") return PENDING_UPLOADS_UNKNOWN;
  const pendingUploads = countPendingUploads(cache.dir);
  removeCacheIfEmpty(cache.dir);
  return pendingUploads;
}

/**
 * A DEAD rclone-engine row about to be replaced: its unsent saves upload only
 * through an rclone mount on the SAME folder — same id, same copy — so any
 * other replacement (`replacement` null: not the rclone engine) is refused
 * while they exist; otherwise its empty folder goes with the row.
 */
export function retireDeadGatewayRow(record: MountRecord, replacement: GatewayCache | null): void {
  if (record.engine !== "rclone") return;
  const cache = cacheDirOfRow(record);
  if (cache === null) {
    warnSavesLeftInDefaultCache(record.slug);
    return;
  }
  if (cache === "corrupt") throw corruptRowRefusal(record);
  const cacheDir = cache.dir;
  if (replacement !== null && gatewayCacheDirFor(replacement) === cacheDir) return;
  const pendingUploads = countPendingUploads(cacheDir);
  if (pendingUploads > 0) {
    throw failure(
      "local-failed",
      `${describePendingUploads(pendingUploads)} file(s) saved to "${record.slug}" by ${describeOwner(record)}'s previous ` +
        "rclone mount have not uploaded yet, and this mount would not upload them.",
      `Run: ${remountFix(record.slug)} under that profile so they upload, or ${discardPendingSavesHint(cacheDir)}.`
    );
  }
  removeCacheIfEmpty(cacheDir);
}
