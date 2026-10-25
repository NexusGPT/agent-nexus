import { errnoOf } from "../../workspace-direct-mount/errno-of";

/**
 * Three answers about a pid, from `kill(pid, 0)`: alive and ours to signal;
 * dead (`ESRCH`); alive but NOT ours to signal (`EPERM` — another user's
 * process, or an administrator's on Windows). Swallowing `EPERM` as "dead" was
 * the bug: `status` then lied, `mount` stacked a second drive on the path, and
 * `unmount` deleted the row of a drive still running. Every other errno reads
 * as dead, which is what each caller did with it before.
 */
export type Liveness = "alive" | "dead" | "not-ours";

export function livenessOf(pid: number): Liveness {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    return errnoOf(error) === "EPERM" ? "not-ours" : "dead";
  }
}
