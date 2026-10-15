/** The comparison operators `-f field:op:value` accepts. */
type FilterOp = "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte";

/** One parsed `-f` expression, in the shape the structured route takes. */
export interface MetricFilter {
  readonly field: string;
  readonly op: FilterOp;
  readonly value: string | string[];
}

/** Everything `analytics metrics` reads off its own flags. */
export interface MetricsOptions {
  metric?: string[];
  groupBy?: string[];
  filter?: string[];
  granularity?: string;
  period?: string;
  orderBy?: string;
  order?: string;
  limit?: number;
  showSql?: boolean;
}

/**
 * Split each `-f` expression on its FIRST TWO colons only.
 *
 * The value may itself contain colons — a timestamp, a URL — so the split is
 * positional rather than a `split(":")`, which would truncate every such value
 * at its first one. `in` is the one operator whose value is a LIST, and it is
 * comma-separated.
 *
 * Throws on a malformed expression: `handleError` in the action turns that into
 * the refusal document with the right exit code, so a bad `-f` never reaches
 * the server.
 */
export function parseMetricFilters(raw: readonly string[] | undefined): MetricFilter[] {
  return (raw ?? []).map((expression) => {
    const idx1 = expression.indexOf(":");
    const idx2 = expression.indexOf(":", idx1 + 1);
    if (idx1 === -1 || idx2 === -1) {
      throw new Error(`Invalid filter "${expression}". Use "field:op:value".`);
    }
    const op = expression.slice(idx1 + 1, idx2);
    const rawValue = expression.slice(idx2 + 1);
    return {
      field: expression.slice(0, idx1),
      op,
      value: op === "in" ? rawValue.split(",") : rawValue
    } as MetricFilter;
  });
}
