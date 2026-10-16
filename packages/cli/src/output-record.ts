// ---------------------------------------------------------------------------
// Record output (key-value pairs)
// ---------------------------------------------------------------------------

import { color } from "./output-color";
import { field, type RecordField } from "./output-columns";
import { emitDocument, isJsonMode } from "./output-json-mode";
import { renderCell } from "./output-render-cell";

/**
 * One resource, as a label/value block — or as the untouched object under
 * `--json`.
 *
 * A `format` is HUMAN-ONLY and the document never sees it, which is what makes
 * a `null` field read as `null` to a script while the terminal shows a sentence.
 * The write side of that same split is `absent()`.
 */
export function printRecord<T extends object>(data: T, fields?: readonly RecordField<T>[]): void {
  if (isJsonMode()) {
    emitDocument(data);
    return;
  }

  const entries = fields
    ? fields.map((f) => [
        f.label,
        f.format ? f.format(field(data, f.key)) : renderCell(field(data, f.key))
      ])
    : Object.entries(data).map(([k, v]) => [k, renderCell(v)]);

  const maxLabel = entries.reduce((max, [label]) => Math.max(max, label.length), 0);

  for (const [label, value] of entries) {
    console.log(`${color.bold(label.padEnd(maxLabel))}  ${value}`);
  }
}
