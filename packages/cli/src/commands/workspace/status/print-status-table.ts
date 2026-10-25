import { type Column, printTable } from "../../../output";
import type { StatusRow } from "./status-row.model";

/**
 * The human channel's table. The three direct-engine columns appear only
 * when at least one row has them, so a machine with no direct mount is not
 * shown three columns of `-`.
 */
export function printStatusTable(rows: readonly StatusRow[]): void {
  // `records` keeps the nullable raw fields for `--json`; the table needs
  // rendered placeholders. No cast: `printTable` checks column keys
  // against the row type now, and the cast would take this call site back
  // out of that check.
  const table = rows.map((row) => row.table);
  // Expires and Refresh belong to direct rows; Pending to every row whose
  // cache is counted — direct, and rclone with its own folder.
  const directColumns: Column<(typeof table)[number]>[] = rows.some((row) => row.health !== null)
    ? [
        { key: "expires", label: "Expires" },
        { key: "refresh", label: "Refresh" }
      ]
    : [];
  const pendingColumn: Column<(typeof table)[number]>[] = rows.some(
    (row) => row.json.pendingUploads !== null
  )
    ? [{ key: "pending", label: "Pending" }]
    : [];
  printTable(table, [
    { key: "slug", label: "Slug" },
    { key: "org", label: "Org" },
    { key: "profile", label: "Profile" },
    { key: "mode", label: "Mode" },
    { key: "engine", label: "Engine" },
    { key: "kind", label: "Kind" },
    { key: "mountPath", label: "Mount point" },
    { key: "live", label: "Live" },
    ...directColumns,
    ...pendingColumn
  ]);
}
