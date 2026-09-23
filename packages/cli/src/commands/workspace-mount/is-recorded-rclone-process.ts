import { execFileSync } from "node:child_process";

import type { MountRecord } from "../../mount-registry";
import { isAlive } from "./is-alive";

/**
 * True when the pid a row recorded is alive AND still an `rclone mount`. A pid
 * is reused after the mount dies, so the bare signal check alone would report a
 * stranger as the drive — and `unmount` would then kill it. The command line is
 * read from `ps`, which every POSIX platform has.
 *
 * debt: a reused pid whose command line happens to name both words (another
 *       rclone mount, an editor open on `rclone-mount.md`) still passes;
 *       compare the mount path too once `ps` output is observed on both Linux
 *       and macOS for a path with spaces.
 */
export function isRecordedRcloneProcess(record: MountRecord): boolean {
  if (typeof record.pid !== "number" || !isAlive(record.pid)) return false;
  // debt: no command-line check on Windows (`tasklist /v` is the probe); add it
  //       once a Windows mount is observed at all.
  if (process.platform === "win32") return true;
  let command: string;
  try {
    command = execFileSync("ps", ["-o", "command=", "-p", String(record.pid)], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    // 🚨 FAIL OPEN. "I could not read it" is not "it is not running", and the
    // two answers have opposite consequences here: a row read as dead is
    // detached (`fusermount -u`) and its registry entry reclaimed, which on a
    // LIVE `--vfs-cache-mode writes` drive discards whatever has not uploaded.
    // `ps` is absent or option-incompatible on a stripped container image
    // (busybox, distroless), so the throw is a real state, not a corner. The
    // signal check above already proved a process is there; keep the pre-branch
    // behaviour of trusting it rather than inventing a death.
    return true;
  }
  return command.includes("rclone") && command.includes("mount");
}
