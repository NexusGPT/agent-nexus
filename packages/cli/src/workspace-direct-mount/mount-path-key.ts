import path from "node:path";

import { type MountPlatform, mountPlatformOf } from "./mount-platform";

/** `X:` or `X:\` — a whole drive letter, the Windows mount point with no folder. */
export function isDriveLetter(mountPath: string): boolean {
  return /^[A-Za-z]:\\?$/.test(mountPath);
}

/**
 * The key two mount points are compared by, so the registry recognises one
 * directory however it was typed. macOS and Linux: `path.resolve`, as always.
 * Windows paths are case-insensitive, so `C:\Users\Jo\nexus\a` and
 * `c:\users\jo\NEXUS\A` are one folder and must be one key — or two drives
 * stack on it — and a drive letter is keyed as `X:` whatever its case or its
 * trailing backslash.
 */
const MOUNT_PATH_KEY_FOR = {
  darwin: (mountPath) => path.resolve(mountPath),
  linux: (mountPath) => path.resolve(mountPath),
  win32: (mountPath) =>
    isDriveLetter(mountPath)
      ? `${mountPath.slice(0, 1).toUpperCase()}:`
      : path.resolve(mountPath).toLowerCase()
} as const satisfies Record<MountPlatform, (mountPath: string) => string>;

export function mountPathKey(mountPath: string): string {
  return MOUNT_PATH_KEY_FOR[mountPlatformOf(process.platform)](mountPath);
}
