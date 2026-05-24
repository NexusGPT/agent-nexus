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

interface Column {
  key: string;
  label: string;
  width?: number;
  format?: (val: unknown) => string;
}

export function printTable(rows: Record<string, unknown>[], columns: Column[]): void {
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
      const val = col.format ? col.format(row[col.key]) : String(row[col.key] ?? "");
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
        const val = col.format ? col.format(row[col.key]) : String(row[col.key] ?? "");
        return val.padEnd(widths[i]).slice(0, widths[i]);
      })
      .join("  ");
    console.log(line);
  }
}

// ---------------------------------------------------------------------------
// Record output (key-value pairs)
// ---------------------------------------------------------------------------

export function printRecord(
  data: Record<string, unknown>,
  fields?: { key: string; label: string; format?: (val: unknown) => string }[]
): void {
  if (_jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const entries = fields
    ? fields.map((f) => [f.label, f.format ? f.format(data[f.key]) : String(data[f.key] ?? "")])
    : Object.entries(data).map(([k, v]) => [k, String(v ?? "")]);

  const maxLabel = entries.reduce((max, [label]) => Math.max(max, label.length), 0);

  for (const [label, value] of entries) {
    console.log(`${color.bold(label.padEnd(maxLabel))}  ${value}`);
  }
}

// ---------------------------------------------------------------------------
// Success output
// ---------------------------------------------------------------------------

export function printSuccess(message: string, data?: Record<string, unknown>): void {
  if (_jsonMode) {
    console.log(JSON.stringify({ success: true, ...data }, null, 2));
    return;
  }

  console.log(color.green("✓") + " " + message);
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      console.log(`  ${color.dim(key + ":")} ${value}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Pagination meta
// ---------------------------------------------------------------------------

export function printPaginationMeta(meta: {
  total?: number;
  page?: number;
  hasMore?: boolean;
}): void {
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

export function printList(
  data: Record<string, unknown>[],
  meta: Record<string, unknown> | undefined,
  columns: Column[]
): void {
  if (_jsonMode) {
    console.log(JSON.stringify({ data, meta }, null, 2));
    return;
  }

  printTable(data, columns);
  if (meta) {
    printPaginationMeta(meta as { total?: number; page?: number; hasMore?: boolean });
  }
}
