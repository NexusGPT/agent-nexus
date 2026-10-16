// ---------------------------------------------------------------------------
// Text → one column of fixed width, without ever making two distinct rows
// read the same.
// ---------------------------------------------------------------------------

/** Appended to a cell that was cut. One column wide in every terminal. */
const ELLIPSIS = "…";

/**
 * Fit rendered text to a column: pad it out, or cut it and SAY SO.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A SILENT CUT MAKES DISTINCT VALUES IDENTICAL, AND THE READER ACTS ON IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The old code was `val.padEnd(width).slice(0, width)` — a hard cut with no
 * marker. `nexus workspace status` renders four mounts under one long shared
 * prefix, so past the 50-char auto-cap all four printed as the SAME path and an
 * operator picking one from that list picks blind. Nothing in the output says a
 * cut happened, which is strictly worse than printing nothing: a blank cell is
 * read as absent, an unmarked truncation is read as the value.
 *
 * The root epilogue already promises "a table COLUMN IS TRUNCATED TO ITS WIDTH".
 * That promise is only usable if a reader can tell WHICH cells it happened to.
 *
 * The ellipsis costs one column of content, which is the correct trade: a cell
 * that is one character shorter and honest beats a cell that is full and wrong.
 */
export function fitCell(text: string, width: number, from: "end" | "middle" = "end"): string {
  if (width <= 0) return "";
  if (text.length <= width) return text.padEnd(width);
  if (width === 1) return ELLIPSIS;
  if (from === "end") return text.slice(0, width - 1) + ELLIPSIS;

  // Middle: keep both ends. Used when cutting the tail would make two rows
  // identical — see `chooseFit`.
  const keep = width - 1;
  const head = Math.ceil(keep / 2);
  return text.slice(0, head) + ELLIPSIS + text.slice(text.length - (keep - head));
}

/** How one column will be cut, and how wide it ends up. */
export interface Fit {
  width: number;
  from: "end" | "middle";
}

/**
 * Pick a fit for one column that CANNOT make two distinct rows read the same.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A VISIBLE CUT IS NOT ENOUGH. THE CELLS MUST STILL BE TELLABLE APART.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Adding an ellipsis fixes "the reader cannot tell a cut happened". It does NOT
 * fix the harm that was actually reported: `workspace status` renders four
 * mounts under a 56-character shared prefix, so cutting the TAIL at 50 leaves
 * four identical cells — now four identical cells that each end in an ellipsis.
 * The operator still cannot tell them apart, and still picks the wrong mount.
 *
 * Proven by the test that failed on the first attempt at this fix: with the
 * ellipsis in and no collapse check, four distinct paths still rendered as one.
 *
 * The printer already holds every row before it chooses a width, so it can just
 * check. Three rungs, cheapest first:
 *
 *  1. **End cut** — the normal case, and it keeps every existing table byte
 *     identical. A uuid column at `width: 10` differs at the HEAD, so it never
 *     leaves this rung.
 *  2. **Middle cut**, if an end cut collapses rows. Paths, slugs and namespaced
 *     ids carry their distinguishing part in the TAIL, so keeping both ends
 *     recovers it at the same width.
 *  3. **No cut**, if a middle cut still collapses rows. The column widens to its
 *     longest value. A wide row is a cosmetic cost; a table asserting two
 *     different things are the same thing is a wrong answer, and this rung is
 *     bounded by the data rather than unbounded.
 *
 * An explicit `col.width` is a request, and rungs 2-3 may override it. That is
 * deliberate: a width is a layout preference, and distinctness is correctness.
 */
export function chooseFit(cells: readonly string[], width: number): Fit {
  const distinct = new Set(cells).size;
  const survives = (from: "end" | "middle"): boolean =>
    new Set(cells.map((c) => fitCell(c, width, from))).size === distinct;

  if (survives("end")) return { width, from: "end" };
  if (survives("middle")) return { width, from: "middle" };
  return { width: cells.reduce((max, c) => Math.max(max, c.length), width), from: "end" };
}
