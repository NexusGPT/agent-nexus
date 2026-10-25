import { createHash } from "node:crypto";

/** The first 16 hex digits of a sha256 — one id per registry key. */
const MOUNT_ID_RE = /^[0-9a-f]{16}$/;

/** The `[profile …]` header rclone's AWS SDK selects through `AWS_PROFILE`. */
const AWS_PROFILE_PREFIX = "nexus-mount-";

declare const mountIdBrand: unique symbol;

/**
 * A mount id this CLI derived or checked. A registry row's `mountId` is a claim
 * read out of a JSON file, and it names folders that are handed to recursive
 * deletes, so a plain string must pass {@link isMountId} before it may stand
 * where a `MountId` is asked for.
 */
export type MountId = string & { readonly [mountIdBrand]: true };

/** `unknown` in: a registry row is a parsed-and-cast file, and `RegExp.test` would coerce a number. */
export function isMountId(value: unknown): value is MountId {
  return typeof value === "string" && MOUNT_ID_RE.test(value);
}

/**
 * The per-mount id: 16 hex digits of the sha256 of the registry key, so one
 * org + slug maps to one session directory and one rclone cache directory on
 * every mount and remount. A hash rather than the key itself because the key
 * carries a base URL, and a directory name must not.
 */
export function mountIdFor(registryKey: string): MountId {
  const id = createHash("sha256").update(registryKey).digest("hex").slice(0, 16);
  // The one mint besides the guard: 16 hex digits of a sha256 are an id by construction.
  return id as MountId;
}

export function awsProfileFor(mountId: string): string {
  return `${AWS_PROFILE_PREFIX}${mountId}`;
}
