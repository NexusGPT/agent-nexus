import fs from "node:fs";

import { fuseLibraryCandidates } from "../../workspace-direct-mount/darwin/fuse-libraries";
import type { MountPlatform } from "../../workspace-direct-mount/mount-platform";

/**
 * The next steps after rclone's fail-fast, per platform, read from everything
 * THIS run wrote to the log: on Windows a Go panic's trace pushes rclone's own
 * line out of the ten-line tail, so the tail alone cannot be the witness — and
 * on macOS and Linux the log is append-only per mount, so a line an earlier
 * run wrote is no witness either.
 */
export const ADVICE_FOR = {
  darwin: () => fuseTAdvice(),
  linux: () => "",
  win32: (thisRun) => (thisRun.toLowerCase().includes("cannot find winfsp") ? winFspAdvice() : "")
} as const satisfies Record<MountPlatform, (thisRun: string) => string>;

function winFspAdvice(): string {
  return [
    "",
    "",
    "rclone could not load WinFsp, the Windows file-system driver it mounts through.",
    "  1. Install WinFsp from https://winfsp.dev/rel/ (an administrator installs it once), then mount again.",
    "  2. Already installed? Restart Windows: the driver loads at boot."
  ].join("\n");
}

/**
 * When the library rclone loaded is FUSE-T — the one this CLI installs — the
 * next steps, in the order they fix it: the Network Volumes permission (the
 * usual first-mount failure), then macFUSE as the MANUAL fallback (a kernel
 * extension needs a reboot into Recovery, so it is named and never installed),
 * then the engine that needs nothing. Same loader order as the preflight.
 */
function fuseTAdvice(): string {
  const loaded = fuseLibraryCandidates(process.env).find((c) => fs.existsSync(c.path));
  if (loaded?.kind !== "fuse-t") return "";
  return [
    "",
    "",
    "FUSE-T did not mount. In order:",
    '  1. Allow "Network Volumes" for your terminal (System Settings › Privacy & Security), then mount again.',
    "  2. Still failing? macFUSE is the fallback: https://macfuse.github.io (one reboot into Recovery).",
    "  3. Or mount it again with --engine webdav — it needs nothing installed."
  ].join("\n");
}
