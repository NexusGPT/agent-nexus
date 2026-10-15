import type { MountRecord } from "../../../mount-registry";
import { refreshJson } from "../../../workspace-direct-mount/refresh-json";
import { isMountLive } from "../../workspace-mount/is-mount-live";
import { jsonPendingUploads } from "../../workspace-mount/json-pending-uploads";
import { directHealthOf } from "./direct-health-of";
import { modeOf } from "./mode-of";
import type { StatusRow } from "./status-row.model";
import { tableRowFor } from "./table-row-for";

/** One registry row, projected once for both channels. */
export function statusRow(
  record: MountRecord,
  now: Date,
  profileExists: (name: string) => boolean
): StatusRow {
  const health = record.engine === "direct" ? directHealthOf(record, profileExists, now) : null;
  const live = isMountLive(record) ? "yes" : "no";
  const json: StatusRow["json"] = {
    slug: record.slug,
    engine: record.engine,
    kind: record.shared ? "shared" : "org",
    mode: modeOf(record),
    // Acting org + profile pinned at mount time (NEX-2360/NEX-2372). Null on
    // legacy records and unknown-org (--api-key) mounts.
    orgId: record.orgId ?? null,
    orgName: record.orgName ?? null,
    profile: record.profile ?? null,
    mountPath: record.mountPath,
    // The direct engine's per-mount id — a hash, never a storage name.
    mountId: record.mountId ?? null,
    expiresAt: health?.expiresAt ?? null,
    refresh: health === null ? null : refreshJson(health.verdict),
    pendingUploads: jsonPendingUploads(health?.pendingUploads),
    live,
    mountedAt: record.mountedAt
  };
  return {
    json,
    table: tableRowFor(json, health, now, live),
    health
  };
}
