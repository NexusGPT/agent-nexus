import { reportFailure } from "../../../errors";
import { printEnvelope, printList } from "../../../output";

/** What both query surfaces answer with — raw SQL and structured alike. */
export interface AnalyticsQueryResult {
  readonly fields: readonly { readonly name: string }[];
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
  readonly executionTimeMs: number;
  readonly truncated?: boolean;
}

/**
 * The server ran the query and reported that it FAILED.
 *
 * The request COMPLETED, which is not the caller mistyping a flag — hence
 * `remote-error` rather than an invalid-input refusal. Shared by `analytics
 * query` and `analytics metrics` because both reach the same executor and both
 * surfaced the identical sentence; two copies of it drift the day one is
 * reworded.
 */
export function reportQueryError(error: string): void {
  process.exitCode = reportFailure(
    "remote-error",
    `Query error: ${error}`,
    "The SQL is run against the curated analytics views; check the table and column names."
  );
}

/**
 * Render a query answer: the rows as a table, then the footer, under one
 * envelope.
 *
 * `truncated` says the answer is PARTIAL, and until NEX-4139 only the terminal
 * was ever told: a script read a short result as a complete one. The whole
 * response is the document now, and the row count, the elapsed time and the
 * truncation flag ride with it.
 *
 * One copy for both surfaces, so a `--json` consumer cannot find the field on
 * one and not the other.
 */
export function printQueryResult(result: AnalyticsQueryResult): void {
  const columns = result.fields.map((f) => ({ key: f.name, label: f.name, width: 28 }));
  printEnvelope(result, () => {
    printList(result.rows, undefined, columns);
    const note = result.truncated ? " (truncated)" : "";
    process.stderr.write(`\n${result.rowCount} row(s) in ${result.executionTimeMs}ms${note}\n`);
  });
}
