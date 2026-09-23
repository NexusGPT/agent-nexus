import { ENGINE_LIVENESS, type MountRecord } from "../../mount-registry";
import { unmountPath } from "./unmount-path";

/**
 * A crashed FUSE process can leave its mount-table entry behind — on Linux the
 * path then answers ENOTCONN to every read, including the emptiness check. A
 * dead pid-probed row is detached best-effort before its path is reused.
 */
export function detachDeadMount(record: MountRecord): void {
  if (ENGINE_LIVENESS[record.engine] === "pid") unmountPath(record.mountPath);
}
