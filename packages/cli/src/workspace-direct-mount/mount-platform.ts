/**
 * The platforms the drive has a rule for. Every per-platform table on the
 * mount path is `satisfies Record<MountPlatform, …>`, so a table missing its
 * Windows row is a compile error, never a silent fallback. Any other Node
 * platform (FreeBSD, OpenBSD, …) lands on the linux row, which is the else-arm
 * the code carried by hand before this list existed.
 */
export const MOUNT_PLATFORMS = ["darwin", "linux", "win32"] as const;
export type MountPlatform = (typeof MOUNT_PLATFORMS)[number];

/** The one gate from Node's platform name to the row a table is keyed on. */
export function mountPlatformOf(platform: NodeJS.Platform): MountPlatform {
  if (platform === "darwin") return "darwin";
  if (platform === "win32") return "win32";
  return "linux";
}
