import { color, isJsonMode, printTable } from "../../../output";
import { type ListVibeAppDomainsResponse } from "../../../vibe-domain-wire-types";
import { colorizeDomainStatus } from "./colorize-domain-status";

/** `apps domains list`: one row per custom domain. */
export function printDomainList(data: ListVibeAppDomainsResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.domains.length === 0) {
    console.log(color.dim("No custom domains on this app."));
    return;
  }

  const rows = data.domains.map((d) => ({
    host: d.host,
    kind: d.kind,
    status: colorizeDomainStatus(d.status),
    primary: d.isPrimary ? color.green("yes") : color.dim("—"),
    statusReason: d.statusReason ?? color.dim("—")
  }));

  printTable(rows, [
    { key: "host", label: "Host" },
    { key: "kind", label: "Kind" },
    { key: "status", label: "Status" },
    { key: "primary", label: "Primary" },
    { key: "statusReason", label: "Reason" }
  ]);
}
