import { createHash } from "node:crypto";

/** The first 16 hex digits of a sha256 — one id per registry key. */
const MOUNT_ID_RE = /^[0-9a-f]{16}$/;

/** The `[profile …]` header rclone's AWS SDK selects through `AWS_PROFILE`. */
const AWS_PROFILE_PREFIX = "nexus-mount-";

export function isMountId(value: string): boolean {
  return MOUNT_ID_RE.test(value);
}

/**
 * The per-mount id: 16 hex digits of the sha256 of the registry key, so one
 * org + slug maps to one session directory and one rclone cache directory on
 * every mount and remount. A hash rather than the key itself because the key
 * carries a base URL, and a directory name must not.
 */
export function mountIdFor(registryKey: string): string {
  return createHash("sha256").update(registryKey).digest("hex").slice(0, 16);
}

export function awsProfileFor(mountId: string): string {
  return `${AWS_PROFILE_PREFIX}${mountId}`;
}
