// ---------------------------------------------------------------------------
// Table output
// ---------------------------------------------------------------------------

import { color } from "./output-color";
import { type Column, field } from "./output-columns";
import { chooseFit, fitCell } from "./output-fit-cell";
import { emitDocument, isJsonMode } from "./output-json-mode";
import { renderCell } from "./output-render-cell";

/**
 * Print rows as an aligned table, or as raw JSON under `--json`.
 *
 * `rows` is `readonly object[]` rather than `Record<string, unknown>[]`. An
 * interface has no index signature, so a properly typed SDK response is NOT
 * assignable to `Record<string, unknown>` — every call site had to cast, and
 * those casts were invisible while the SDK returned `any`. Accepting `object`
 * lets a typed response through unmodified.
 */
export function printTable<T extends object>(
  rows: readonly T[],
  columns: readonly Column<T>[]
): void {
  if (isJsonMode()) {
    emitDocument(rows);
    return;
  }

  if (rows.length === 0) {
    console.log(color.dim("No results."));
    return;
  }

  // Render every cell up front. The fit for a column is a property of ALL its
  // values together, not of one value at a time — see `chooseFit`.
  const cells = columns.map((col) =>
    rows.map((row) =>
      col.format ? col.format(field(row, col.key)) : renderCell(field(row, col.key))
    )
  );

  const fits = columns.map((col, i) => {
    const maxDataLen = cells[i].reduce((max, c) => Math.max(max, c.length), 0);
    const requested = col.width ?? Math.min(Math.max(col.label.length, maxDataLen), 50);
    return chooseFit(cells[i], requested);
  });

  // Header. Fitted like a data cell: an explicit `width` narrower than the label
  // used to pad without cutting, so the label overflowed its column and every
  // column to its right lost alignment for the whole table.
  console.log(columns.map((col, i) => color.bold(fitCell(col.label, fits[i].width))).join("  "));
  console.log(fits.map((f) => "─".repeat(f.width)).join("  "));

  rows.forEach((_, r) => {
    console.log(fits.map((f, i) => fitCell(cells[i][r], f.width, f.from)).join("  "));
  });
}
