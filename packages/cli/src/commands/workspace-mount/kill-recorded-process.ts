import { ENGINE_LIVENESS, type MountRecord } from "../../mount-registry";
import { isRecordedRcloneProcess } from "./is-recorded-rclone-process";

/** Kill the detached rclone a pid-probed engine recorded, if it is still that process. */
export function killRecordedProcess(record: MountRecord): void {
  if (ENGINE_LIVENESS[record.engine] !== "pid") return;
  if (typeof record.pid !== "number" || !isRecordedRcloneProcess(record)) return;
  try {
    process.kill(record.pid);
  } catch {
    /* already gone */
  }
}
