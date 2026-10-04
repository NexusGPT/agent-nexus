/**
 * The six terminals this scan classifies a leaf by, and the one that outranks
 * the rest.
 */

/** The six, and nothing else. Each is a terminal in the walk below. */
export const SHAPE_PRINTERS = [
  "printRecord",
  "printList",
  "printTable",
  "printSuccess",
  "printDryRun",
  "printEnvelope"
] as const;

/**
 * `printEnvelope` OUTRANKS whatever printer runs inside its callback.
 *
 * 🚨 WITHOUT THIS RULE, ADOPTING THE PRINTER THAT FIXES A COMMAND'S SHAPE
 * DELETES THAT COMMAND'S SHAPE LINE. `printEnvelope(result, () =>
 * printTable(rows, cols))` reaches two of the six, and two is refused as
 * `branches` — so `folder list` would have gone from a WRONG line ("a bare
 * array") to NO line, and the help would have got quieter for a command that
 * had just been made answerable.
 *
 * It is a definition rather than a tie-break. `printEnvelope` owns the only
 * `if (_jsonMode)` branch on the path and never calls its callback under
 * `--json`, so a printer inside that callback is human-channel BY
 * CONSTRUCTION. There is no branch for the two to disagree about: the document
 * is the envelope, always.
 */
export const DOMINANT_PRINTER = "printEnvelope";

export type ShapePrinter = (typeof SHAPE_PRINTERS)[number];

export const PRINTER_SET: ReadonlySet<string> = new Set(SHAPE_PRINTERS);
