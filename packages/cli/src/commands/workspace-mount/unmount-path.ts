import { execFileSync } from "node:child_process";

import { type MountPlatform, mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import { stopHidden, type StopResult } from "./win32/stop-rclone-hidden";

type UnmountCandidate = readonly [command: string, args: readonly string[]];

/**
 * The OS tools that detach a mount point, tried in order until one exits 0.
 * Windows has none: WinFsp releases the drive letter or folder when rclone
 * ends, so its step is by PID, below.
 */
const UNMOUNT_CANDIDATES_FOR = {
  darwin: [
    ["umount", []],
    ["diskutil", ["unmount"]]
  ],
  linux: [
    ["fusermount", ["-u"]],
    ["umount", []]
  ],
  win32: []
} as const satisfies Record<MountPlatform, readonly UnmountCandidate[]>;

/** Whether this platform detaches a mount point with an OS tool before the process is ended. */
export function hasUnmountStep(): boolean {
  return UNMOUNT_CANDIDATES_FOR[mountPlatformOf(process.platform)].length > 0;
}

/** OS-native unmount of a mount point. Best-effort across platforms/engines. */
export function unmountPath(mountPath: string): void {
  for (const [command, args] of UNMOUNT_CANDIDATES_FOR[mountPlatformOf(process.platform)]) {
    try {
      execFileSync(command, [...args, mountPath], { stdio: "ignore" });
      return;
    } catch {
      /* try the next candidate */
    }
  }
}

/**
 * The ask that stands in for an OS tool: rclone told to exit on its own, so
 * that WinFsp notifies Explorer and the drive leaves "This PC" at once — after
 * a kill the dead drive stays there until a refresh (observed 2026-10-21). It
 * is aimed at a PID, not a path, so it runs only for a process `unmount` has
 * proved is this drive; a row of the table above would also run for a dead
 * row, whose pid may be a stranger's by now. macOS and Linux need no ask: their
 * OS unmount already makes rclone exit.
 */
const EXIT_REQUEST_FOR = {
  darwin: () => "not-asked",
  linux: () => "not-asked",
  win32: (pid) => stopHidden(pid) ?? "failed"
} as const satisfies Record<MountPlatform, (pid: number) => ExitRequest>;

/**
 * What became of the ask: rclone's own answer; `failed` for a PowerShell that
 * could not run or left no answer; `not-asked` where the OS unmount is the ask.
 */
export type ExitRequest = StopResult | "failed" | "not-asked";

/** Ask the proven rclone at `pid` to exit; `"exited"` means there is nothing left to kill. */
export function askToExit(pid: number): ExitRequest {
  return EXIT_REQUEST_FOR[mountPlatformOf(process.platform)](pid);
}
