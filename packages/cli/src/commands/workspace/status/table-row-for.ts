import { firstNonBlankOr } from "../../../util/present-text";
import { describeRefresh } from "../../../workspace-direct-mount/describe-refresh";
import type { DirectMountHealth } from "../../../workspace-direct-mount/direct-mount-health";
import { formatExpiry } from "../../../workspace-direct-mount/format-expiry";
import { describePendingUploads } from "../../../workspace-direct-mount/pending-uploads-unknown";
import type { StatusRow } from "./status-row.model";

/** The table's rendering of one row: every `null` in the `--json` projection becomes a placeholder glyph here. */
export function tableRowFor(
  json: StatusRow["json"],
  health: DirectMountHealth | null,
  now: Date,
  live: "yes" | "no"
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
    live,
    expires: expiresAt === null ? "-" : formatExpiry(expiresAt, now),
    refresh: health === null ? "-" : describeRefresh(health.verdict, now, live === "yes"),
    pending: health === null ? "-" : describePendingUploads(health.pendingUploads)
  };
}
