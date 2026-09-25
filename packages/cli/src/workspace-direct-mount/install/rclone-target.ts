import type { RcloneTarget } from "./install-pins";

/**
 * Which of the four pinned rclone builds fits this machine, from the two facts
 * Node reports about it: `process.platform` and `process.arch`. Null means the
 * CLI has no build to offer here, so the install step is never planned and
 * the preflight refuses with the manual hint as it does today. Windows is
 * null on purpose (its FUSE layer, WinFsp, is not installed by this CLI), and
 * so is every architecture rclone does not publish for these two platforms.
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
  return null;
}
