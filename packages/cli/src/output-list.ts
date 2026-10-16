// ---------------------------------------------------------------------------
// List with pagination (JSON wraps data + meta)
// ---------------------------------------------------------------------------

import { type Column } from "./output-columns";
import { emitDocument, isJsonMode } from "./output-json-mode";
import { printPaginationMeta, readPagination } from "./output-pagination";
import { printTable } from "./output-table";

/**
 * A page of rows: `{data, meta}` under `--json`, a table plus a footer for a
 * terminal.
 *
 * The document carries `meta` whole, which is why `printPaginationMeta` is
 * human-channel only — a script reads the server's own paging fields rather
 * than the sentence rendered from them.
 */
export function printList<T extends object>(
  data: readonly T[],
  meta: object | undefined,
  columns: readonly Column<T>[]
): void {
  if (isJsonMode()) {
    emitDocument({ data, meta });
    return;
  }

  printTable(data, columns);
  if (meta) {
    printPaginationMeta(readPagination(meta));
  }
}
