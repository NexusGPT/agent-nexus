// ---------------------------------------------------------------------------
// Output formatting — plain text (default) or JSON (--json)
// ---------------------------------------------------------------------------

let _jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  _jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return _jsonMode;
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
 * Column formatter for a `folder` field (`{ id, name } | null`) — renders the
 * folder name, or a dash when the resource is not in a folder. JSON output keeps
 * the full object untouched; this only affects the human-readable table.
 */
export function formatFolder(val: unknown): string {
  if (val && typeof val === "object" && "name" in val) {
    return String((val as { name: unknown }).name ?? "—");
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
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log(color.dim("No results."));
    return;
  }

  // Calculate widths
  const widths = columns.map((col) => {
    const headerLen = col.label.length;
    const maxDataLen = rows.reduce((max, row) => {
      const val = col.format ? col.format(field(row, col.key)) : String(field(row, col.key) ?? "");
      return Math.max(max, val.length);
    }, 0);
    return col.width ?? Math.min(Math.max(headerLen, maxDataLen), 50);
  });

  // Header
  const header = columns.map((col, i) => color.bold(col.label.padEnd(widths[i]))).join("  ");
  console.log(header);
  console.log(columns.map((_, i) => "─".repeat(widths[i])).join("  "));

  // Rows
  for (const row of rows) {
    const line = columns
      .map((col, i) => {
        const val = col.format
          ? col.format(field(row, col.key))
          : String(field(row, col.key) ?? "");
        return val.padEnd(widths[i]).slice(0, widths[i]);
      })
      .join("  ");
    console.log(line);
  }
}

// ---------------------------------------------------------------------------
// Record output (key-value pairs)
// ---------------------------------------------------------------------------

export function printRecord<T extends object>(data: T, fields?: readonly RecordField<T>[]): void {
  if (_jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const entries = fields
    ? fields.map((f) => [
        f.label,
        f.format ? f.format(field(data, f.key)) : String(field(data, f.key) ?? "")
      ])
    : Object.entries(data).map(([k, v]) => [k, String(v ?? "")]);

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

export function printSuccess(message: string, data?: object): void {
  if (_jsonMode) {
    console.log(JSON.stringify({ success: true, ...jsonPayload(data) }, null, 2));
    return;
  }

  console.log(color.green("✓") + " " + message);
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      console.log(`  ${color.dim(key + ":")} ${isAbsent(value) ? value[ABSENT_TEXT] : value}`);
    }
  }
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
    console.log(JSON.stringify({ data, meta }, null, 2));
    return;
  }

  printTable(data, columns);
  if (meta) {
    printPaginationMeta(readPagination(meta));
  }
}
