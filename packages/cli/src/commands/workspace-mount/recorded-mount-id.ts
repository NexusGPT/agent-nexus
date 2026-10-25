import { failure } from "../../errors";
import type { CategorizedCliError } from "../../exit-codes";
import type { MountRecord } from "../../mount-registry";
import { isMountId, type MountId, mountIdFor } from "../../workspace-direct-mount/mount-id";

/** A row whose recorded id cannot name a folder: the way out is to drop the row. */
export function corruptRowRefusal(record: MountRecord): CategorizedCliError {
  return failure(
    "local-failed",
    `The registry row for "${record.slug}" is corrupt: its mount id "${String(record.mountId)}" is not 16 hex digits.`,
    `Run: nexus workspace unmount ${record.slug}, then mount it again.`
  );
}

/**
 * The mount id a remount of a row runs on: the row's own — the folders its
 * dead drive wrote into — or the key's for a row that recorded none. The id is
 * read out of `workspace-mounts.json`, so one that is not an id throws the
 * corrupt-row refusal.
 */
export function recordedMountId(record: MountRecord, registryKey: string): MountId {
  if (record.mountId === undefined) return mountIdFor(registryKey);
  if (isMountId(record.mountId)) return record.mountId;
  throw corruptRowRefusal(record);
}
