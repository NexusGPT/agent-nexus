import { ENGINE_LIVENESS, type MountRecord } from "../../mount-registry";
import { isMountPoint } from "./is-mount-point";
import { isRecordedRcloneProcess } from "./is-recorded-rclone-process";

// ── Mount state (so `unmount`/`status` can find the mount again) ──────────────
// The registry record/IO lives in ../mount-registry, org-scoped per NEX-2360:
// keys are `<kind>:<acting-org>|<slug>` — the kind tag (`org:`/`profile:`/`url:`)
// keeps a profile named after an org id out of that org's key space — and each
// record pins the org/profile + ro/rw mode it was mounted with (NEX-2372).
// Legacy bare-slug records stay readable.

/** Liveness of a recorded mount, by the probe its engine declares. */
export function isMountLive(record: MountRecord): boolean {
  if (ENGINE_LIVENESS[record.engine] === "pid") return isRecordedRcloneProcess(record);
  return isMountPoint(record.mountPath);
}
