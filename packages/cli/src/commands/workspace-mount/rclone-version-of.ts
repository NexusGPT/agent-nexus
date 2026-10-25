import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { errnoOf } from "../../workspace-direct-mount/errno-of";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";
import { type MountPlatform, mountPlatformOf } from "../../workspace-direct-mount/mount-platform";

/**
 * What an errno other than ENOENT means when `<binary> version` fails: a
 * damaged copy the pinned reinstall replaces (`null`), or a policy that
 * refuses to run it, whose fix is an administrator's allow rule and never a
 * reinstall (`refused`). On Windows a bad image (`EFTYPE`: the wrong CPU, a
 * truncated file) is damage, and every other errno is the `UNKNOWN` or
 * `EACCES` a Smart App Control, AppLocker or antivirus block surfaces as.
 */
const ERRNO_READ_FOR = {
  darwin: posixErrnoRead,
  linux: posixErrnoRead,
  win32: (code) => (code === "EFTYPE" ? null : { refused: code })
} as const satisfies Record<
  MountPlatform,
  (code: string, binary: string) => { readonly refused: string } | null
>;

/**
 * Where the probe runs. Windows looks for a bare `rclone` in the working
 * folder BEFORE PATH, and the folder a mount is typed in is one other people
 * write to, so there the probe runs from the home folder.
 */
const PROBE_CWD_FOR = {
  darwin: () => undefined,
  linux: () => undefined,
  win32: () => os.homedir()
} as const satisfies Record<MountPlatform, () => string | undefined>;

/**
 * On macOS and Linux, `EACCES` on a file that has its exec bit is a policy (a
 * noexec mount, SELinux, AppArmor), and so is `EPERM`. `EACCES` without the
 * bit, `ENOEXEC` (the wrong CPU) and the rest are a damaged copy.
 */
function posixErrnoRead(code: string, binary: string): { readonly refused: string } | null {
  if (code === "EPERM") return { refused: code };
  if (code === "EACCES" && hasExecBit(binary)) return { refused: code };
  return null;
}

/**
 * The DEFAULT `fs` import: the driven mount specs fake `node:fs` through it.
 * Only a full address is read: a bare PATH name would be looked up in the
 * working folder, which says nothing about the file PATH resolved.
 */
function hasExecBit(file: string): boolean {
  if (!path.isAbsolute(file)) return false;
  try {
    return (fs.statSync(file).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * `<binary> version` as text. No such file (ENOENT) is `null`, the "not found"
 * answer; any other errno is read by this platform's row above. A binary that
 * ran and exited non-zero is `null`.
 */
export function rcloneVersionOf(
  binary: RcloneBinary,
  platform: NodeJS.Platform
): string | null | { readonly refused: string } {
  try {
    return execFileSync(binary, ["version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      cwd: PROBE_CWD_FOR[mountPlatformOf(platform)]()
    });
  } catch (error) {
    const code = errnoOf(error);
    if (code !== undefined && code !== "ENOENT") {
      return ERRNO_READ_FOR[mountPlatformOf(platform)](code, binary);
    }
    return null;
  }
}
