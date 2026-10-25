import type { MountRecord } from "../../../mount-registry";
import type { DirectMountHealth } from "../../../workspace-direct-mount/direct-mount-health";
import { refreshJson } from "../../../workspace-direct-mount/refresh-json";
import { gatewayPendingUploads } from "../../workspace-mount/gateway-cache";
import { mountLivenessOf } from "../../workspace-mount/is-mount-live";
import { jsonPendingUploads } from "../../workspace-mount/json-pending-uploads";
import { directHealthOf } from "./direct-health-of";
import { modeOf } from "./mode-of";
import type { StatusRow } from "./status-row.model";
import { tableRowFor } from "./table-row-for";

/** Unsent saves: a direct row's from its health read, an rclone row's from its own folder, null elsewhere. */
function rowPendingUploads(record: MountRecord, health: DirectMountHealth | null): number | null {
  if (health !== null) return health.pendingUploads;
  return gatewayPendingUploads(record);
}

/** One registry row, projected once for both channels. */
export function statusRow(
  record: MountRecord,
  now: Date,
  profileExists: (name: string) => boolean
): StatusRow {
  const health = record.engine === "direct" ? directHealthOf(record, profileExists, now) : null;
  const liveness = mountLivenessOf(record);
  // A drive another user or an administrator holds is live: it is up, and it
  // is not this CLI's to stop. The table says who; the JSON pair stays yes/no.
  const live = liveness === "dead" ? "no" : "yes";
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
    // The per-mount id of a direct or rclone drive — a hash, never a storage name.
    mountId: record.mountId ?? null,
    expiresAt: health?.expiresAt ?? null,
    refresh: health === null ? null : refreshJson(health.verdict),
    pendingUploads: jsonPendingUploads(rowPendingUploads(record, health)),
    live,
    mountedAt: record.mountedAt
  };
  return {
    json,
    table: tableRowFor(json, health, now, liveness),
    health
  };
}
