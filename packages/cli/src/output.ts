// ---------------------------------------------------------------------------
// Output formatting — plain text (default) or JSON (--json)
// ---------------------------------------------------------------------------

let _jsonMode = false;
import { nonBlankOr } from "./util/present-text";

/**
 * Has a JSON document already been written to STDOUT in this run?
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A SECOND `console.log` UNDER `--json` IS NOT A LONGER DOCUMENT. IT IS TWO,
 *    AND `JSON.parse` REFUSES THE PAIR.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The root epilogue promises "--json prints ONE JSON document on STDOUT and
 * nothing else", and every printer in this file honoured it INDIVIDUALLY while
 * nothing honoured it COLLECTIVELY. `printRecord(resource)` followed by
 * `printSuccess("Created.")` is the whole defect: each call is correct, each
 * writes its own complete document, and the caller receives them concatenated.
 * A script gets `SyntaxError: Unexpected non-whitespace character after JSON`,
 * or — worse — reads only the first and never learns there was a second.
 *
 * Nine commands shipped that pair. Guarding the pair at each call site is a
 * rule, not a mechanism: the tenth call site has the defect again on the day it
 * is written, and nothing tells its author.
 *
 * So the invariant moves into the ONE funnel every document goes through.
 * {@link emitDocument} keeps a per-run flag and FIRST WINS: the first document
 * is the payload and goes to stdout; anything after it goes to STDERR, where the
 * profile banner and every warning already live. Nothing is lost, the pipe stays
 * parseable, and a call site cannot reintroduce the defect by being written.
 *
 * FIRST, not last, and that ordering is a decision rather than an accident. In
 * every observed pair the first document is the resource and the second is a
 * confirmation sentence about it — `printRecord(sender)` then "WhatsApp sender
 * created." A script wants the sender.
 *
 * ⚠️ WHAT THIS DOES NOT REACH: a command that calls `console.log` itself. Around
 * forty commands build their own document with a bare
 * `console.log(JSON.stringify(...))` rather than going through a printer, and a
 * module-level flag cannot see a write it is not asked to make. That half is
 * covered by a gate rather than by construction —
 * `json-one-document.test.ts` drives every leaf and parses its stdout — which is
 * strictly weaker, and saying so here is the point: the gate reports, this makes
 * impossible, and only the printers are in the second category.
 */
let _documentEmitted = false;

/**
 * Enter or leave JSON mode, and START A NEW RUN.
 *
 * The reset is load-bearing rather than tidy. One `nexus` process runs one
 * command and exits, so the flag would never need clearing in production — but
 * a test file runs dozens of commands in one process, and a flag that survived
 * between them would divert the SECOND test's only document to stderr and read
 * as a command printing nothing at all. The mode change IS the run boundary, in
 * the binary and in a spec alike, so it is the only place that clears it.
 */
export function setJsonMode(enabled: boolean): void {
  _jsonMode = enabled;
  _documentEmitted = false;
}

export function isJsonMode(): boolean {
  return _jsonMode;
}

/**
 * Write one JSON document, or divert it to stderr if stdout already has one.
 *
 * THE ONLY WAY THIS FILE WRITES JSON TO STDOUT. `errors.ts` routes its error
 * document through it too, so a command that printed a partial result and then
 * failed still leaves exactly one document on stdout — and still exits 1, which
 * is what the epilogue tells a caller to read.
 *
 * See {@link _documentEmitted} for why the guard lives here and what it cannot
 * see.
 */
export function emitDocument(value: unknown): void {
  const text = JSON.stringify(value, null, 2);

  if (_documentEmitted) {
    process.stderr.write(text + "\n");
    return;
  }

  _documentEmitted = true;
  console.log(text);
}

/** Whether {@link emitDocument} has already claimed stdout. For the gate. */
export function jsonDocumentEmitted(): boolean {
  return _documentEmitted;
}

// ---------------------------------------------------------------------------
// Colors (ANSI 24-bit)
// ---------------------------------------------------------------------------

const NO_COLOR =
  !!process.env.NO_COLOR || process.argv.includes("--no-color") || !process.stdout.isTTY;

function c(code: string, text: string): string {
  return NO_COLOR ? text : `\x1b[${code}m${text}\x1b[0m`;
}

export const color = {
  orange: (t: string) => c("38;2;245;70;26", t),
  teal: (t: string) => c("38;2;0;183;165", t),
  dim: (t: string) => c("2", t),
  bold: (t: string) => c("1", t),
  red: (t: string) => c("31", t),
  green: (t: string) => c("32", t),
  yellow: (t: string) => c("33", t),
  cyan: (t: string) => c("36", t)
};

// ---------------------------------------------------------------------------
// Table output
// ---------------------------------------------------------------------------

/**
 * One column of a {@link printTable}.
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

/** One rendered field of a {@link printRecord}. */
export interface RecordField<T> {
  key: ColumnKey<T>;
  label: string;
  format?: (val: unknown) => string;
}

/** One rendered column of a {@link printTable} / {@link printList}. */
export interface Column<T> extends RecordField<T> {
  width?: number;
}

/**
 * Read one column's value off a row.
 *
 * The single cast in this file, and the reason the printers can take `object`.
 * A column key is chosen at runtime, so the read is by definition dynamic; the
 * alternative is not a safer read but the same cast repeated at every call
 * site, which is what this replaces.
 */
/**
 * The pagination fields the printers actually read.
 *
 * Every list command hands this `client.*.list()`'s `meta`, whose SDK type is
 * `PaginationMeta` — a plain interface with no index signature. The parameter
 * used to be `Record<string, unknown>`, which an interface is not assignable
 * to, so ~18 call sites cast their way in and this function cast its way back
 * out. Naming the three fields removes both halves: `PaginationMeta` satisfies
 * it structurally, and nothing has to be asserted anywhere.
 */
export interface PaginationLike {
  total?: number;
  page?: number;
  hasMore?: boolean;
}

function field(row: object, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

/**
 * Marks a value the terminal cannot honestly render.
 *
 * A cell that says nothing is better than a cell that says the WRONG thing, and
 * `[object Object]` is the wrong thing: it looks like a value, occupies the
 * column, and tells the reader nothing about what is actually there.
 */
const UNRENDERABLE = "[unrenderable]";

/**
 * `String(x)` reached `Object.prototype.toString` somewhere in the value.
 *
 * A SUBSTRING test, not an anchored one, and the difference is a real hole:
 * `String([{a:1},{b:2}])` is `"[object Object],[object Object]"`, which an
 * anchored `^\[object \w+\]$` does not match — so a two-element array of objects
 * slipped through while a one-element array (whose `toString` IS the element's)
 * was caught. Arrays are handled before this test anyway, but the substring form
 * is the one that stays correct for whatever shape arrives next.
 */
const USELESS_TO_STRING = /\[object [A-Za-z]+\]/;

/**
 * Render one value into one terminal cell. The ONLY value-to-text conversion
 * the printers perform.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `String(value)` ON AN OBJECT PRINTS `[object Object]`, AND NOTHING CATCHES IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every printer here used to interpolate `String(field(row, key) ?? "")`. That is
 * correct for a string, a number and a boolean — and for an object or an array it
 * emits `[object Object]`, which typechecks, lints clean, passes every test that
 * asserts a column is present, and is unreadable. `nexus analytics overview`
 * shipped four such fields of twelve (`tokenUsage`, `timeSeries`, `byChannel`,
 * `byDeployment`, `byModel`), and `nexus access-card get` shipped `policies` — the
 * field whose whole point is that you must read the key set.
 *
 * A response field is a nested object often enough that a per-command `format`
 * cannot be the defence: the next command to render one has the bug again, and
 * the bug is invisible until a human looks at the output. So the printer refuses
 * to produce the shape at all.
 *
 * The rule is deliberately generic rather than a list of known types: use the
 * value's own `toString` when it has a real one, and JSON otherwise. That covers
 * every object shape a v1 response can carry, including ones nobody has written
 * yet.
 *
 * `--json` never reaches this function. It serializes the untouched response, so
 * a script still gets the full nested object.
 */
export function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;

  // A Date's own toString is a verbose local-time sentence; the wire format is
  // ISO 8601 and that is what the rest of the CLI prints.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? UNRENDERABLE : value.toISOString();
  }
  if (value instanceof Error) return value.message;

  // An array's own toString is a comma join, which is a "real" toString by the
  // test below and yet destroys the structure: `[1,2]` reads as `1,2`, and
  // `[{a:1},{b:2}]` reads as `[object Object],[object Object]`. Always JSON.
  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value) ?? UNRENDERABLE;
    } catch {
      return UNRENDERABLE;
    }
  }

  const asString = String(value);
  if (!USELESS_TO_STRING.test(asString)) return asString;

  // Only objects with no useful toString reach here. JSON says what they hold.
  try {
    const json = JSON.stringify(value);
    return json ?? UNRENDERABLE;
  } catch {
    // Circular, or a BigInt inside. Never fall back to String() — that is the
    // exact `[object Object]` this function exists to make impossible.
    return UNRENDERABLE;
  }
}

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
interface Fit {
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
function chooseFit(cells: readonly string[], width: number): Fit {
  const distinct = new Set(cells).size;
  const survives = (from: "end" | "middle"): boolean =>
    new Set(cells.map((c) => fitCell(c, width, from))).size === distinct;

  if (survives("end")) return { width, from: "end" };
  if (survives("middle")) return { width, from: "middle" };
  return { width: cells.reduce((max, c) => Math.max(max, c.length), width), from: "end" };
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
  if (_jsonMode) {
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

// ---------------------------------------------------------------------------
// Envelope output — the whole response, with a human view of one part of it
// ---------------------------------------------------------------------------

/**
 * Emit the SERVER'S OWN RESPONSE under `--json`, and render a human view of
 * whichever part of it a terminal can usefully show.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 NARROWING THE RESPONSE BEFORE THE OUTPUT-FORMAT BRANCH DELETES FIELDS FROM
 *    `--json` THAT NOTHING DOWNSTREAM CAN RECOVER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `GET /folders` answers `{folders, assignments}`, and `folder list` opened with
 *
 *     const folders = result.folders ?? result;
 *     printTable(folders, COLUMNS);
 *
 * One line ABOVE the printer, so the choice of what to keep was made before
 * anything knew whether the caller asked for a table or for a document.
 * `printTable` then emitted the array it was handed and `--json` carried
 * folders alone. `assignments` is the ONLY agent-to-folder map the API
 * publishes — folder rows carry no membership — so the flag whose whole purpose
 * is machine consumption was the one that could not answer "which folder is
 * this agent in".
 *
 * The shape is copy-paste, not a one-off: the table wants one array, so the
 * action takes one array, and the document silently inherits the table's taste.
 * Two commands (`skill-folder list`, `permissions list-resource-access`) had
 * already been cured BY HAND with an `if (isJsonMode()) { console.log(JSON…) }`
 * early return — a correct fix that has to be remembered, that bypasses
 * {@link emitDocument} and so drops out of the one-document guarantee, and that
 * makes the command unclassifiable to `json-shape.scan.ts` and therefore
 * silent in `--help`.
 *
 * So the split becomes a function. The ENVELOPE is what a script gets; the
 * callback runs only when there is a terminal to draw for, and cannot reach the
 * document at all. A call site cannot narrow the wrong channel because it never
 * chooses the channel.
 *
 * ⚠️ `render` MUST NOT emit a document of its own. It is not called in JSON mode,
 * so anything it prints is human-channel by construction — that is the property
 * `json-shape.scan.ts` relies on when it treats this printer as dominant over
 * whatever printer runs inside the callback.
 */
export function printEnvelope<E extends object>(envelope: E, render: () => void): void {
  if (_jsonMode) {
    emitDocument(envelope);
    return;
  }

  render();
}

// ---------------------------------------------------------------------------
// Record output (key-value pairs)
// ---------------------------------------------------------------------------

export function printRecord<T extends object>(data: T, fields?: readonly RecordField<T>[]): void {
  if (_jsonMode) {
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

// ---------------------------------------------------------------------------
// Success output
// ---------------------------------------------------------------------------

/**
 * A field that is ABSENT, carrying the sentence a human should read instead.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `x ?? "(none)"` IN A `printSuccess` PAYLOAD PUTS DISPLAY COPY ON THE WIRE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `printSuccess` renders ONE object down two channels, so the `??` that makes a
 * null readable in the terminal also replaces the null in `--json`. A script then
 * has to detect absence by matching English — the working detection against CLI
 * 0.21.9 literally read `if moved_from and "belonged to no Role" not in
 * str(moved_from)` — which breaks silently the day the copy is reworded, and the
 * fields it happens on are consequential: whether another team just lost a system,
 * and whether a Role has an owner at all (NEX-3628). Worse, the SAME field is a
 * proper `null` on the matching GET, because reads go through `printRecord`, whose
 * `format` is human-only and leaves the JSON document untouched.
 *
 * So `x ?? absent("(none)")` keeps the `??` idiom and splits the two channels:
 * `--json` gets `null`, the terminal gets the sentence. It is deliberately the
 * only way to say it — a bare string in the payload is, and should be, a value the
 * caller is expected to parse.
 */
const ABSENT_TEXT = Symbol("the human rendering of an absent value");

/** A `null` on the wire that reads as a sentence in the terminal. */
export interface AbsentValue {
  readonly [ABSENT_TEXT]: string;
}

/** `null` under `--json`; `text` in the human rendering. See {@link AbsentValue}. */
export function absent(text: string): AbsentValue {
  return { [ABSENT_TEXT]: text };
}

function isAbsent(value: unknown): value is AbsentValue {
  return typeof value === "object" && value !== null && ABSENT_TEXT in value;
}

/**
 * The payload as a script reads it.
 *
 * An {@link AbsentValue} carries its text on a SYMBOL key, which `JSON.stringify`
 * omits — so an unmapped one would serialize as `{}` rather than as the display
 * copy it replaces. Mapping it to `null` here is what makes the field mean the
 * same thing on the write as it does on the matching read.
 */
function jsonPayload(data: object | undefined): Record<string, unknown> {
  if (data === undefined) return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, isAbsent(value) ? null : value])
  );
}

/**
 * A 2xx, rendered.
 *
 * 🔴 `message` IS CARRIED INTO THE JSON DOCUMENT, AND THAT IS THE POINT OF THIS
 * FUNCTION HAVING TWO ARGUMENTS.
 *
 * It used to be dropped under `--json`, which made the machine-readable output
 * carry strictly LESS diagnostic information than the human one. That is only
 * cosmetic while the message is a constant restating the data — and it is not a
 * constant everywhere. Eight call sites choose the message on the RESULT:
 *
 *     printSuccess(result.removed ? "Workspace revoked." : "No such grant.",
 *                  { removed: result.removed })
 *
 * There the branch IS the diagnosis. A caller reading the human form was told
 * `No such grant.`; the same call under `--json` got a bare `removed: false`,
 * which reads as "the operation failed" rather than "you named something that
 * does not exist". A user who passed a workspace id where a grant id was wanted
 * had the explanation available and the flag he used threw it away.
 *
 * Derived, not listed: an AST sweep of all 193 `printSuccess` call sites found
 * the 8 with a conditional message, and 0 passing a `message` key of their own —
 * so nothing collides with the key added here. The gate that keeps it that way
 * is `output-json-keeps-the-diagnostic.test.ts`.
 *
 * `message` is added, never substituted, so every existing `--json` consumer
 * reading `success` or a data field is unaffected.
 */
export function printSuccess(message: string, data?: object): void {
  if (_jsonMode) {
    emitDocument({ success: true, message, ...jsonPayload(data) });
    return;
  }

  console.log(color.green("✓") + " " + message);
  printHumanPayload(data);
}

/** The indented `key: value` block under a one-line verdict. Human channel only. */
function printHumanPayload(data?: object): void {
  if (!data) return;
  for (const [key, value] of Object.entries(data)) {
    const rendered = isAbsent(value) ? value[ABSENT_TEXT] : renderCell(value);
    console.log(`  ${color.dim(key + ":")} ${rendered}`);
  }
}

/**
 * A `--dry-run` verdict — the command did NOT act, and said what it would do.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A DRY RUN IS A TERMINAL RESULT, SO UNDER `--json` IT IS A DOCUMENT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `agent delete`, `deployment delete` and `workflow delete` each printed a
 * yellow sentence and returned. Under `--json` that sentence WAS the whole of
 * stdout: unparseable, at exit 0, on the one flag whose entire purpose is to let
 * a script check before it destroys something. The script gets a `SyntaxError`
 * where it asked for a preview, and the obvious recovery — drop `--dry-run` —
 * is the destructive one.
 *
 * `success: true` is deliberately NOT in this envelope. Nothing succeeded; the
 * command declined to act. `dryRun: true` is the discriminator, and a consumer
 * that switches on `success` sees a shape it does not recognise rather than a
 * shape that lies.
 */
export function printDryRun(message: string, data?: object): void {
  if (_jsonMode) {
    emitDocument({ dryRun: true, message, ...jsonPayload(data) });
    return;
  }

  console.log(color.yellow("DRY RUN:") + " " + message);
  printHumanPayload(data);
}

// ---------------------------------------------------------------------------
// Warning output
// ---------------------------------------------------------------------------

/**
 * Print a prominent warning to STDERR. Always written (even in --json mode and
 * non-TTY) because warnings flag hazards a caller must not miss — but kept off
 * stdout so it never contaminates a `--json` document (NEX-2176). Lines after
 * the first are dimmed continuation/hint text.
 */
export function printWarning(message: string, ...hints: string[]): void {
  process.stderr.write(color.yellow(`⚠ ${message}`) + "\n");
  for (const hint of hints) {
    process.stderr.write(color.dim(`  ${hint}`) + "\n");
  }
}

// ---------------------------------------------------------------------------
// Pagination meta
// ---------------------------------------------------------------------------

function readPagination(meta: object): PaginationLike {
  const total = field(meta, "total");
  const page = field(meta, "page");
  const hasMore = field(meta, "hasMore");
  return {
    total: typeof total === "number" ? total : undefined,
    page: typeof page === "number" ? page : undefined,
    hasMore: typeof hasMore === "boolean" ? hasMore : undefined
  };
}

export function printPaginationMeta(meta: PaginationLike): void {
  if (_jsonMode) return; // already included in JSON output

  const parts: string[] = [];
  if (meta.total != null) parts.push(`${meta.total} total`);
  if (meta.page != null) parts.push(`page ${meta.page}`);
  if (meta.hasMore) parts.push("more available");

  if (parts.length > 0) {
    console.log(color.dim(`\n${parts.join(" · ")}`));
  }
}

// ---------------------------------------------------------------------------
// Context banner — shows active profile on every command
// ---------------------------------------------------------------------------

import type { ProfileSource, ResolvedProfile } from "./config";

const SOURCE_LABELS: Record<ProfileSource, string> = {
  flag: "flag override",
  env: "env",
  directory: ".nexusrc",
  active: "active",
  default: "default",
  override: "api-key override"
};

/**
 * Print a one-line context banner to stderr showing the active profile.
 * Suppressed in JSON mode and non-TTY mode.
 *
 * Example: `▸ acme-corp (Acme Corp) · active`
 */
export function printContextBanner(resolved: ResolvedProfile): void {
  if (_jsonMode) return;
  if (!process.stderr.isTTY) return;

  const orgPart = resolved.profile.orgName ? ` (${resolved.profile.orgName})` : "";
  const line = `▸ ${resolved.name}${orgPart} · ${SOURCE_LABELS[resolved.source]}`;
  process.stderr.write(color.dim(line) + "\n");
}

// ---------------------------------------------------------------------------
// List with pagination (JSON wraps data + meta)
// ---------------------------------------------------------------------------

export function printList<T extends object>(
  data: readonly T[],
  meta: object | undefined,
  columns: readonly Column<T>[]
): void {
  if (_jsonMode) {
    emitDocument({ data, meta });
    return;
  }

  printTable(data, columns);
  if (meta) {
    printPaginationMeta(readPagination(meta));
  }
}
