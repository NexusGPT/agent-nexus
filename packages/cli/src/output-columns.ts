// ---------------------------------------------------------------------------
// Column and field declarations — what a printer is TOLD to render, and the
// one dynamic read that turns a declared key into a value.
// ---------------------------------------------------------------------------

import { nonBlankOr } from "./util/present-text";

/**
 * One column of a `printTable`.
 *
 * `key` is checked against the row type. A bare `string` here is a silent
 * blank-cell generator: a key no row carries renders an empty column forever,
 * with no error, no warning, and no cast to grep. `nexus model list` shipped
 * two blank columns of four this way, because the table asked for `name` and
 * `contextWindow` while the row declares `displayName` and `contextSize`.
 *
 * `ColumnKey<T>` falls back to `string` only when `T` carries no string keys
 * at all — `object`, `any`, an empty-tuple row. In those cases there is nothing
 * to check against, and rejecting every key would report the CALL as broken
 * when the column list is fine. Everywhere the row type is known, a wrong key
 * is a compile error.
 */
export type ColumnKey<T> = [Extract<keyof T, string>] extends [never]
  ? string
  : Extract<keyof T, string>;

/** One rendered field of a `printRecord`. */
export interface RecordField<T> {
  key: ColumnKey<T>;
  label: string;
  format?: (val: unknown) => string;
}

/** One rendered column of a `printTable` / `printList`. */
export interface Column<T> extends RecordField<T> {
  width?: number;
}

/**
 * Read one column's value off a row.
 *
 * The single cast in this family, and the reason the printers can take
 * `object`. A column key is chosen at runtime, so the read is by definition
 * dynamic; the alternative is not a safer read but the same cast repeated at
 * every call site, which is what this replaces.
 */
export function field(row: object, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

/**
 * Column formatter for a `folder` field (`{ id, name } | null`) — renders the
 * folder name, or a dash when the resource is not in a folder. JSON output keeps
 * the full object untouched; this only affects the human-readable table.
 */
export function formatFolder(val: unknown): string {
  if (val && typeof val === "object" && "name" in val) {
    // `?? "—"` here rendered an EMPTY CELL for a folder named "", which is the
    // one thing this function's docblock promises never to do. `nonBlankOr`
    // also absorbs the non-string case, so the `String(...)` cast is gone with
    // it — a folder whose `name` is a number was never meant to print either.
    return nonBlankOr((val as { name: unknown }).name, "—");
  }
  return "—";
}
