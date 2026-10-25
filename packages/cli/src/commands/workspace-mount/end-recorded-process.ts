import type { MountRecord } from "../../mount-registry";
import { type Killable, mayEnd } from "./assert-ours-to-kill";
import { recordedPidOf, recordedRcloneProcessOf } from "./is-recorded-rclone-process";
import { askToExit, type ExitRequest, hasUnmountStep } from "./unmount-path";

/**
 * End the rclone a pid-probed row recorded. Where an OS unmount ran first, the
 * pid is probed AGAIN: rclone exits on that unmount, and the pid it frees may
 * belong to a stranger by the time the kill is sent. `mayEnd` is the same
 * decision `assertOursToKill` refused on. Where the platform asks rclone to
 * exit instead (Windows), an rclone that did is not killed: the pid it freed is
 * nobody's to signal, and one the ask had to end was ended through its handle.
 * Only an ask that could not run at all falls back to the kill by pid. Returns
 * what the ask came to, null where there was nothing to end.
 */
export function endRecordedProcess(
  record: MountRecord,
  verdict: Killable | null
): ExitRequest | null {
  const pid = recordedPidOf(record);
  if (verdict === null || pid === null) return null;
  const atKill = hasUnmountStep() ? recordedRcloneProcessOf(record) : verdict;
  if (!mayEnd(atKill)) return null;
  const asked = askToExit(pid);
  if (asked === "exited" || asked === "killed") return asked;
  try {
    process.kill(pid);
  } catch {
    /* already gone */
  }
  return asked;
}
