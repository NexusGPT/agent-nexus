import { failure } from "../../errors";
import { ENGINE_LIVENESS, type MountRecord } from "../../mount-registry";
import { type MountPlatform, mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import {
  recordedPidOf,
  type RecordedProcess,
  recordedRcloneProcessOf
} from "./is-recorded-rclone-process";

/** What `unmount` may hold after the refusals below: a verdict that is never "not-ours". */
export type Killable = Exclude<RecordedProcess, "not-ours">;

/**
 * Whether `unmount` may kill a pid the CLI could not prove is still this
 * drive. On macOS and Linux it always could — the pre-branch behaviour, kept —
 * because the signal check proved a process is there and `ps` failing is a
 * stripped image, not a stranger. On Windows the command-line probe is
 * PowerShell and a pid is reused freely after a reboot, so a probe that could
 * not run leaves TerminateProcess aimed at whatever holds the pid today.
 */
const KILL_ON_UNKNOWN = {
  darwin: true,
  linux: true,
  win32: false
} as const satisfies Record<MountPlatform, boolean>;

/** One row per verdict: the ONE decision behind the refusal before the OS unmount and the kill after it. */
const MAY_END = {
  yes: () => true,
  unknown: () => KILL_ON_UNKNOWN[mountPlatformOf(process.platform)],
  no: () => false,
  "not-ours": () => false
} as const satisfies Record<RecordedProcess, () => boolean>;

/** Whether `unmount` may end the pid on this verdict, on this platform. */
export function mayEnd(verdict: RecordedProcess): boolean {
  return MAY_END[verdict]();
}

/**
 * Before `unmount` touches a pid-probed row: refuse, with the row KEPT, when
 * the process is alive under another account or an administrator (every
 * platform), or when it could not be confirmed and this platform does not kill
 * on a guess. Nothing kills what it cannot prove is ours. Returns the verdict
 * the kill that follows starts from; `null` is a row no pid probes.
 */
export function assertOursToKill(record: MountRecord): Killable | null {
  if (ENGINE_LIVENESS[record.engine] !== "pid" || recordedPidOf(record) === null) return null;
  const verdict = recordedRcloneProcessOf(record);
  if (verdict === "not-ours") {
    throw failure(
      "local-failed",
      `The drive for "${record.slug}" (pid ${String(record.pid)}) was started by another user or an administrator, so this CLI cannot stop it.`,
      "Unmount it from that account or terminal. The registry row is kept."
    );
  }
  if (verdict === "unknown" && !mayEnd(verdict)) {
    throw failure(
      "local-failed",
      `Could not confirm that pid ${String(record.pid)} is still the drive for "${record.slug}", so it was not ended.`,
      "End rclone.exe in Task Manager, then unmount again. The registry row is kept."
    );
  }
  return verdict;
}
