import { ENGINE_LIVENESS, type MountRecord } from "../../mount-registry";
import { isMountPoint } from "./is-mount-point";
import { type RecordedProcess, recordedRcloneProcessOf } from "./is-recorded-rclone-process";

// ── Mount state (so `unmount`/`status` can find the mount again) ──────────────
// The registry record/IO lives in ../mount-registry, org-scoped per NEX-2360:
// keys are `<kind>:<acting-org>|<slug>` — the kind tag (`org:`/`profile:`/`url:`)
// keeps a profile named after an org id out of that org's key space — and each
// record pins the org/profile + ro/rw mode it was mounted with (NEX-2372).
// Legacy bare-slug records stay readable.

/**
 * Liveness of a recorded mount, by the probe its engine declares. `not-ours`
 * is a pid-probed drive running under another account or an administrator:
 * live, and not this CLI's to stop. A probe that could not read the command
 * line reads as live too — a READ fails open.
 */
export type MountLiveness = "live" | "dead" | "not-ours";

/** One row per probe answer, so a new answer does not compile until someone decides what it means here. */
const LIVENESS_OF = {
  yes: "live",
  unknown: "live",
  no: "dead",
  "not-ours": "not-ours"
} as const satisfies Record<RecordedProcess, MountLiveness>;

export function mountLivenessOf(record: MountRecord): MountLiveness {
  if (ENGINE_LIVENESS[record.engine] !== "pid") {
    return isMountPoint(record.mountPath) ? "live" : "dead";
  }
  return LIVENESS_OF[recordedRcloneProcessOf(record)];
}

/** The yes/no the callers that only need "may I mount here" ask: anything not dead is live. */
export function isMountLive(record: MountRecord): boolean {
  return mountLivenessOf(record) !== "dead";
}
