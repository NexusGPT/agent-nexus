/**
 * READING IDS OUT OF A PRODUCER'S `--json` BODY. Pure, so it can be tested
 * without a network or a binary.
 */

/**
 * The ids a producer response carries, for one consuming param.
 *
 * ── Why the param name decides the field ─────────────────────────────────────
 *
 * 🚨 A BLIND `.id` IS WRONG FOR AT LEAST ONE REAL LEAF, and it fails in the
 * expensive direction. `workspace search <slug>` takes a SLUG; threading a row's
 * uuid into that position produces a 404, and a 404 from a route that exists
 * reads exactly like a broken route. So the row's field named after the param is
 * preferred, and `id` is the fallback rather than the rule.
 *
 * The param name is the route's own spelling (`:slug`, `:agentId`), which is the
 * API's vocabulary rather than the CLI's — the CLI spells the same thing `id`,
 * `agent-id` and `agentId` in different places, so it is the wrong side to read.
 *
 * ── The envelope ─────────────────────────────────────────────────────────────
 *
 * A list response is either a bare array or `{ data: [...] }`. Anything else
 * yields NO ids, which the caller reports as SKIPPED rather than as a pass —
 * see the runner's outcomes.
 */
/**
 * The ROWS a producer's body carries, or `undefined` when it is not a list at
 * all — a parse failure, or an envelope this reader does not recognise.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 "PARSED, AND EMPTY" AND "DID NOT PARSE" ARE OPPOSITE FACTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * {@link idsFrom} deliberately collapses both into `[]`, because for THREADING
 * they mean the same thing: no id to pass. {@link import("./id-graph.race")}
 * asks a different question — *is the id we threaded still listed?* — and there
 * the two are opposites. An empty list PROVES the id is gone; an unparseable
 * body proves nothing at all, and reading it as proof would soften a real
 * not-found into a raced one, which is the whole failure this harness refuses.
 *
 * So the envelope rule lives here once and answers both. Re-implementing it in
 * the race module would be a second copy of a rule that decides a verdict.
 */
export function rowsFrom(body: string): unknown[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }

  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed !== "object" || parsed === null) return undefined;

  const data = (parsed as { data?: unknown }).data;
  return Array.isArray(data) ? data : undefined;
}

export function idsFrom(body: string, param: string): string[] {
  const rows = rowsFrom(body);
  if (rows === undefined) return [];

  const out: string[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    // The param's own name first; `id` only as a fallback. See the docblock.
    const picked = record[param] ?? record.id;
    if (typeof picked === "string" && picked.length > 0) out.push(picked);
  }
  return out;
}
