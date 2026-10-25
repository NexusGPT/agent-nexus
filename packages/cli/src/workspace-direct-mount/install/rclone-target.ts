import type { MountPlatform } from "../mount-platform";
import type { RcloneTarget } from "./install-pins";

/**
 * Which of the six pinned rclone builds fits this machine, from the two facts
 * Node reports about it: `process.platform` and `process.arch`. Null means the
 * CLI has no build to offer here, so the install step is never planned and
 * the preflight refuses with the manual hint as it does today: every
 * architecture rclone does not publish for these three platforms, and every
 * other platform.
 *
 * The arguments are Node's own unions, never bare strings: a uname spelling
 * like `"aarch64"` is not a `NodeJS.Architecture`, so it cannot reach this
 * table and silently answer null on a supported Mac.
 */
export function rcloneTargetFor(
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture
): RcloneTarget | null {
  if (platform === "darwin") {
    if (arch === "arm64") return "osx-arm64";
    if (arch === "x64") return "osx-amd64";
    return null;
  }
  if (platform === "linux") {
    if (arch === "x64") return "linux-amd64";
    if (arch === "arm64") return "linux-arm64";
    return null;
  }
  if (platform === "win32") {
    if (arch === "x64") return "windows-amd64";
    if (arch === "arm64") return "windows-arm64";
    return null;
  }
  return null;
}

/** The platform a build runs on — what decides the managed file name it is placed under. */
export const TARGET_PLATFORM = {
  "osx-arm64": "darwin",
  "osx-amd64": "darwin",
  "linux-amd64": "linux",
  "linux-arm64": "linux",
  "windows-amd64": "win32",
  "windows-arm64": "win32"
} as const satisfies Record<RcloneTarget, MountPlatform>;
