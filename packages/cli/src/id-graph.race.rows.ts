/**
 * READING AN ID BACK OUT OF A PRODUCER'S FRESH ROWS.
 *
 * The matching half of the race check, in its own file because it has to stay
 * identical to the rule `idsFrom` threads BY — and a rule that must agree with
 * another module is the one worth being able to read on its own.
 * `id-graph.race.ts` owns what a hit or a miss then MEANS.
 */

/**
 * Does any row publish `id` for `param`?
 *
 * The same field rule `idsFrom` threads by — the param's own name first, `id`
 * only as a fallback — because the question is whether THIS id would still be
 * threaded, not whether the string appears anywhere in the body. A substring
 * search over the whole body would answer yes for an id quoted inside an
 * unrelated field and turn a genuine race back into a red.
 */
export function listsId(rows: readonly unknown[], param: string, id: string): boolean {
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    const picked = record[param] ?? record.id;
    if (picked === id) return true;
  }
  return false;
}
