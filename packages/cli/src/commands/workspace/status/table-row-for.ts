import { firstNonBlankOr } from "../../../util/present-text";
import { describeRefresh } from "../../../workspace-direct-mount/describe-refresh";
import type { DirectMountHealth } from "../../../workspace-direct-mount/direct-mount-health";
import { formatExpiry } from "../../../workspace-direct-mount/format-expiry";
import {
  describePendingUploads,
  PENDING_UPLOADS_UNKNOWN
} from "../../../workspace-direct-mount/pending-uploads-unknown";
import type { MountLiveness } from "../../workspace-mount/is-mount-live";
import type { StatusRow } from "./status-row.model";

const LIVE_CELL_FOR = {
  live: "yes",
  dead: "no",
  "not-ours": "yes (another user / administrator)"
} as const satisfies Record<MountLiveness, string>;

/** The Pending cell: the count as `--json` carries it, spoken for a human. */
function pendingCell(pendingUploads: StatusRow["json"]["pendingUploads"]): string {
  if (pendingUploads === null) return "-";
  if (pendingUploads === "unknown") return describePendingUploads(PENDING_UPLOADS_UNKNOWN);
  return describePendingUploads(pendingUploads);
}

/** The table's rendering of one row: every `null` in the `--json` projection becomes a placeholder glyph here. */
export function tableRowFor(
  json: StatusRow["json"],
  health: DirectMountHealth | null,
  now: Date,
  liveness: MountLiveness
): StatusRow["table"] {
  const expiresAt = health?.expiresAt ?? null;
  return {
    slug: json.slug,
    org: firstNonBlankOr([json.orgName, json.orgId], "?"),
    profile: json.profile ?? "-",
    mode: json.mode ?? "?",
    engine: json.engine,
    kind: json.kind,
    mountPath: json.mountPath,
    live: LIVE_CELL_FOR[liveness],
    expires: expiresAt === null ? "-" : formatExpiry(expiresAt, now),
    refresh: health === null ? "-" : describeRefresh(health.verdict, now, liveness !== "dead"),
    pending: pendingCell(json.pendingUploads)
  };
}
