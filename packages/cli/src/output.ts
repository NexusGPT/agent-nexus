// ---------------------------------------------------------------------------
// Output formatting — plain text (default) or JSON (--json)
// ---------------------------------------------------------------------------
//
// THE PUBLIC SURFACE, AND NOTHING ELSE. Every name below is declared in a leaf
// beside this file and re-exported here, so `from "./output"` keeps meaning
// exactly what it meant when this was one file — which matters, because it is
// one of the most-imported specifiers in the package.
//
// This file IMPORTS NOTHING, deliberately. A leaf that imported the index back
// would make the index part of a cycle, and `import/no-cycle` is armed on this
// package (from `packages/config/eslint/base-flat.js`, not the root config) at
// one warning PER SIBLING against a nine-warning package cap. So every leaf
// imports its neighbours DIRECTLY and never through here.
//
// WHERE EACH THING LIVES, because a reader arriving at this specifier is owed
// the file that holds the reasoning rather than a list of names:
//
//   output-json-mode.ts    the `--json` flag and the ONE-document funnel.
//                          Every printer reads the mode through `isJsonMode()`
//                          and writes through `emitDocument`.
//   output-color.ts        ANSI colour, and the load-time `NO_COLOR` read.
//   output-columns.ts      what a printer is TOLD to render: `Column`,
//                          `RecordField`, the one dynamic row read, `formatFolder`.
//   output-render-cell.ts  value → text. Why `[object Object]` is unrepresentable.
//   output-fit-cell.ts     text → a fixed-width column that cannot make two
//                          distinct rows read the same.
//   output-table.ts        `printTable`.
//   output-envelope.ts     `printEnvelope` — why narrowing above the printer
//                          deletes fields from `--json`.
//   output-record.ts       `printRecord`.
//   output-absent.ts       `absent()` — a `null` on the wire that reads as a
//                          sentence in the terminal (NEX-3628).
//   output-verdict.ts      `printSuccess`, `printDryRun`, and the payload block.
//   output-warning.ts      `printWarning` — stderr, always.
//   output-pagination.ts   `PaginationLike`, the footer, and the meta read.
//   output-banner.ts       `printContextBanner`.
//   output-list.ts         `printList` — a table plus that footer.
// ---------------------------------------------------------------------------

export type { AbsentValue } from "./output-absent";
export { absent } from "./output-absent";
export { printContextBanner } from "./output-banner";
export { color } from "./output-color";
export type { Column, ColumnKey, RecordField } from "./output-columns";
export { formatFolder } from "./output-columns";
export { printEnvelope } from "./output-envelope";
export { fitCell } from "./output-fit-cell";
export { emitDocument, isJsonMode, jsonDocumentEmitted, setJsonMode } from "./output-json-mode";
export { printList } from "./output-list";
export type { PaginationLike } from "./output-pagination";
export { printPaginationMeta } from "./output-pagination";
export { printRecord } from "./output-record";
export { renderCell } from "./output-render-cell";
export { printTable } from "./output-table";
export { printDryRun, printSuccess } from "./output-verdict";
export { printWarning } from "./output-warning";
