import path from "node:path";

import { STATE_DIR } from "../mount-registry";
import type { MountPlatform } from "./mount-platform";

/**
 * Where the CLI keeps the rclone it installed itself: `~/.nexus-mcp/bin/rclone`.
 *
 * The CLI owns this copy because the two places a user would put rclone both
 * fail on a Mac that has Homebrew. Homebrew's own `rclone` is built without the
 * `cmount` tag and refuses `rclone mount`; the official `install.sh` writes
 * `/usr/local/bin`, which `/opt/homebrew/bin` shadows on a standard PATH, and
 * it exits "already installed" without writing anything when Homebrew's copy is
 * at the latest version. A copy under the CLI's own state directory, spawned by
 * absolute path, is reached by neither trap.
 */
export const MANAGED_RCLONE_DIR = path.join(STATE_DIR, "bin");

/** The managed binary's file name per platform: Windows needs the `.exe`, or nothing spawns it. */
const MANAGED_RCLONE_FILE = {
  darwin: "rclone",
  linux: "rclone",
  win32: "rclone.exe"
} as const satisfies Record<MountPlatform, string>;

/**
 * The managed copy's full path for a platform, and the only way any code names
 * it: the probe, the zip installer and the rendered place line call this.
 */
export function managedRcloneFor(platform: MountPlatform): string {
  return path.join(MANAGED_RCLONE_DIR, MANAGED_RCLONE_FILE[platform]);
}

/**
 * The PATH name rclone is spawned by when no managed copy exists — the
 * pre-managed behaviour, kept so a machine with the official binary on PATH and
 * nothing under `~/.nexus-mcp/bin` mounts exactly as before.
 */
export const PATH_RCLONE = "rclone";

declare const rcloneBinary: unique symbol;

/**
 * The rclone the preflight probed, and therefore the only rclone a spawn may
 * run. A plain `string` would let a caller spawn a PATH name the probe never
 * saw — the exact case where a Homebrew build sits ahead of the official one —
 * so the value is branded and `rclonePreflight` (commands/workspace-mount) is
 * the only code that mints one. The probe resolves it once and the result
 * travels to the spawn, so a copy removed between the two cannot turn a passed
 * preflight into a spawn of the wrong binary.
 */
export type RcloneBinary = string & { readonly [rcloneBinary]: true };
