import { execFileSync } from "node:child_process";

import type { MountRecord } from "../../mount-registry";
import { type MountPlatform, mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import { livenessOf } from "./is-alive";
import { win32CommandLineScript } from "./win32/win32-command-line";
import { readPowerShell } from "./win32/win32-powershell";

/**
 * Whether the pid a row recorded is alive AND still an `rclone mount`. A pid
 * is reused after the mount dies, so the bare signal check alone would report
 * a stranger as the drive — and `unmount` would then kill it.
 *
 * Four answers. `unknown` is "I could not read the command line" and it FAILS
 * OPEN: the two answers have opposite consequences here — a row read as dead
 * is detached and its registry entry reclaimed, which on a live
 * `--vfs-cache-mode writes` drive discards whatever has not uploaded — and a
 * probe that could not run (`ps` absent on a stripped image, PowerShell
 * refused) has said nothing. `not-ours` is an rclone mount alive under another
 * account or an administrator: not dead, and not something this CLI may kill.
 *
 * A live pid is `yes` only when its command line names an rclone mount AT THIS
 * ROW'S mount path: a pid reused by another drive's rclone (another org's, on
 * the same account) is that drive, and `unmount` must not kill it.
 *
 * A pid the signal probe cannot touch (`EPERM`) still has its command line
 * read. One that names no rclone at all is a stranger (root's `launchd`, a
 * SYSTEM service) holding a reused pid, so the recorded rclone is gone: `no`.
 * So is an rclone mount at another path. One that cannot be read, reads
 * empty, or is only an image name (Windows withholds another account's command
 * line and the reader then prints `rclone.exe`) stays `not-ours`: nothing
 * proved the recorded rclone gone.
 */
export type RecordedProcess = "yes" | "no" | "unknown" | "not-ours";

/**
 * The UTF-8 locale `ps` runs under: `ps` prints a byte the locale cannot show
 * as an escape (`M-C…`), so under `LANG=C` — cron, launchd, a CI step — an
 * accented mount path would never match. The caller's own UTF-8 locale wins
 * (LC_ALL, LC_CTYPE, LANG): glibc 2.17 hosts have no `C.UTF-8`, and `ps` under
 * a locale it lacks prints `?` instead.
 */
function utf8LocaleFor(env: NodeJS.ProcessEnv, fallback: string): string {
  for (const name of ["LC_ALL", "LC_CTYPE", "LANG"] as const) {
    const value = env[name];
    if (value !== undefined && /utf-?8/i.test(value)) return value;
  }
  return fallback;
}

/** `-ww`: unlimited width, so a long mount path is never cut off the line. */
function psCommandLineIn(fallbackLocale: string): (pid: number) => string | null {
  return (pid) => {
    try {
      return execFileSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, LC_ALL: utf8LocaleFor(process.env, fallbackLocale) }
      });
    } catch {
      return null;
    }
  };
}

/** One command-line reader per platform; `null` is "could not read", never "empty". */
const COMMAND_LINE_OF = {
  darwin: psCommandLineIn("en_US.UTF-8"),
  linux: psCommandLineIn("C.UTF-8"),
  win32: (pid) => readPowerShell(win32CommandLineScript(pid))
} as const satisfies Record<MountPlatform, (pid: number) => string | null>;

/**
 * The mount path on an `rclone mount` line: the argument after `mount <remote>`
 * up to the first flag, compared WHOLE — as a substring, `…/docs` matched the
 * drive at `…/docs-archive`, and `unmount docs` on a reused pid killed it.
 * `ps -o command=` prints a path with a space unquoted, so it runs to the ` --`;
 * WMI quotes it, so one pair of quotes is dropped. `null`: not an rclone mount.
 */
const MOUNT_PATH_ON_LINE = /\brclone(?:\.exe)?"?\s+mount\s+\S+\s+(.+?)(?=\s+--|\s*$)/;

function mountPathOnLine(command: string): string | null {
  const line = command.split(/\r?\n/, 1)[0] ?? "";
  const found = MOUNT_PATH_ON_LINE.exec(line)?.[1];
  return found === undefined ? null : found.replace(/^"(.*)"$/, "$1");
}

/** Windows paths are case-insensitive (the registry keys them folded, mount-path-key.ts); elsewhere a path is its bytes. */
function isThisRowsPath(found: string, mountPath: string): boolean {
  if (mountPlatformOf(process.platform) !== "win32") return found === mountPath;
  return found.toLowerCase() === mountPath.toLowerCase();
}

function namesThisRowsMount(command: string, mountPath: string): boolean {
  const found = mountPathOnLine(command);
  return found !== null && isThisRowsPath(found, mountPath);
}

/**
 * A pid this account may signal: its command line decides. A process the
 * signal probe just found alive HAS a command line, so an empty read is a
 * reader that failed quietly (a WMI query that returned nothing and exited 0):
 * unknown, never a stranger.
 */
function aliveVerdict(command: string | null, mountPath: string): RecordedProcess {
  if (command === null || command.trim() === "") return "unknown";
  return namesThisRowsMount(command, mountPath) ? "yes" : "no";
}

/** A pid held by another account or an administrator (`EPERM`). */
function notOursVerdict(command: string | null, mountPath: string): RecordedProcess {
  if (command === null || command.trim() === "") return "not-ours";
  if (!command.includes("rclone")) return "no";
  // An rclone whose mount path cannot be read (the image name alone) proved nothing.
  const found = mountPathOnLine(command);
  if (found === null) return "not-ours";
  return isThisRowsPath(found, mountPath) ? "not-ours" : "no";
}

/**
 * The pid a row recorded, or null. The registry is a parsed-and-cast file, so
 * the value is checked here: `kill(2)` reads 0 and a negative number as a
 * process GROUP (-1 is every process this user may signal), never as one
 * process, and nothing of ours is ever recorded under such a number.
 */
export function recordedPidOf(record: MountRecord): number | null {
  const { pid } = record;
  return typeof pid === "number" && Number.isInteger(pid) && pid > 0 ? pid : null;
}

export function recordedRcloneProcessOf(record: MountRecord): RecordedProcess {
  const pid = recordedPidOf(record);
  if (pid === null) return "no";
  const liveness = livenessOf(pid);
  const commandLineOf = COMMAND_LINE_OF[mountPlatformOf(process.platform)];
  switch (liveness) {
    case "dead":
      return "no";
    case "alive":
      return aliveVerdict(commandLineOf(pid), record.mountPath);
    case "not-ours":
      return notOursVerdict(commandLineOf(pid), record.mountPath);
    default:
      return liveness satisfies never;
  }
}
