import type { MountRecord } from "../../../mount-registry";
import { isMountAccess } from "../../../workspace-direct-mount/mount-access";

/**
 * The EFFECTIVE mode: what was asked for (`readOnly` — the flag, or a CODE
 * kind) or, on a direct row, the read grade the server granted instead. The
 * row keeps the request so `remount` can ask for it again; this column is
 * where the grant joins it, so a drive that refuses every write never prints
 * `rw`.
 */
export function modeOf(record: MountRecord): "ro" | "rw" | null {
  // Mode is observable BEFORE writing now (NEX-2372). Legacy records predate
  // the field, so surface "unknown" rather than guessing rw.
  if (record.readOnly === undefined) return null;
  // A grade this CLI does not recognise is "unknown", never "read-write".
  // `access` comes out of the same parsed-and-cast registry file as `mountId`,
  // so `"READ"` or a truncated write would otherwise fall through the equality
  // below and print `rw` over a drive the server graded read — the one claim
  // this column exists to never make.
  if (record.access !== undefined && !isMountAccess(record.access)) return null;
  return record.readOnly || record.access === "read" ? "ro" : "rw";
}
