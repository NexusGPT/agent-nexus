import type { CloudItem, CloudItemPage, ImportedDocument, ImportResult } from "@agent-nexus/sdk";

import { type Column, isJsonMode, printList } from "../../../output";

// Annotated, not inferred: a bare literal widens `key` to `string` and the
// column keys stop being checked against the row.
export const ITEM_COLUMNS: Column<CloudItem>[] = [
  { key: "id", label: "ID" },
  { key: "name", label: "NAME" },
  { key: "isFolder", label: "FOLDER" },
  { key: "mimeType", label: "TYPE" },
  { key: "modifiedTime", label: "MODIFIED" }
];

export const IMPORTED_COLUMNS: Column<ImportedDocument>[] = [
  { key: "id", label: "ID" },
  { key: "name", label: "NAME" },
  { key: "status", label: "STATUS" }
];

export function printImportResult(result: ImportResult): void {
  printList(result.documents, { importedCount: result.importedCount }, IMPORTED_COLUMNS);

  // printPaginationMeta only understands total/page/paging, so the count above
  // is dropped in table mode — and the count is the answer to "did it work".
  if (!isJsonMode()) {
    const plural = result.importedCount === 1 ? "" : "s";
    console.log(`\nImported ${result.importedCount} document${plural}.`);
  }
}

export function printItems(page: CloudItemPage): void {
  printList(
    page.items,
    page.nextPageToken === undefined ? undefined : { nextPageToken: page.nextPageToken },
    ITEM_COLUMNS
  );

  // printPaginationMeta only understands total/page/paging, so in table mode
  // the token is dropped and the listing looks complete when it is not. Print
  // the flag that continues it, not just the fact that more exists.
  if (!isJsonMode() && page.nextPageToken !== undefined) {
    console.log(`\nMore results — continue with --page-token ${page.nextPageToken}`);
  }
}
