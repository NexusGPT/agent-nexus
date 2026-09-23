import fs from "node:fs";
import path from "node:path";

import { writeSecretFile } from "../util/secret-file";
import { isRecord } from "./is-record";

/**
 * Which COPY of a slug a cache directory belongs to.
 *
 * 🔴 THE MOUNT ID DOES NOT SAY. It is a hash of the registry key,
 * `<kind>:<id>|<slug>`, and a slug can name two different workspaces at once —
 * the organization's own and the ownerless admin-shared one. They differ only
 * in a field the key never carries, so both hash to ONE mount id and therefore
 * ONE cache directory.
 *
 * That is only dangerous because a dirty cache deliberately OUTLIVES its mount:
 * `unmount` keeps a cache holding unsent saves, since it is their only copy, and
 * the next direct mount on the same id drains it. If that next mount is the
 * other copy, rclone is pointed at the other BUCKET — the platform one — and the
 * private workspace's unsent bytes upload into the shared library every
 * organization can read. Nothing else catches it: the live-mount guard needs a
 * row, and a clean unmount leaves none.
 *
 * So the cache states its own provenance, and a mount that disagrees is refused
 * rather than drained. The file sits INSIDE the cache directory so it shares its
 * lifetime exactly: kept while saves are pending, removed with the empty cache.
 */
export interface CacheOwner {
  readonly shared: boolean;
}

export function readCacheOwner(cacheOwnerFile: string): CacheOwner | null {
  let raw: string;
  try {
    raw = fs.readFileSync(cacheOwnerFile, "utf-8");
  } catch {
    // Absent, or unreadable. Neither states a provenance, so neither refuses:
    // every cache written before this file existed is in that state, and
    // refusing them all would strand saves this very guard exists to protect.
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) && typeof parsed.shared === "boolean"
      ? { shared: parsed.shared }
      : null;
  } catch {
    return null;
  }
}

export function writeCacheOwner(cacheOwnerFile: string, owner: CacheOwner): void {
  fs.mkdirSync(path.dirname(cacheOwnerFile), { recursive: true });
  writeSecretFile(cacheOwnerFile, JSON.stringify(owner) + "\n");
}
