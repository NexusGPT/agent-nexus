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
 * see the runner's four outcomes.
 */
export function idsFrom(body: string, param: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { data?: unknown }).data)
      ? (parsed as { data: unknown[] }).data
      : [];

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
