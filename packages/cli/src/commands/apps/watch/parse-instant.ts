/**
 * An ISO-8601 instant, or `null` for anything unusable. Every way of failing to
 * parse resolves to "not observed". On the CURRENT reading that fails the
 * freshness test, which is the safe direction — the alternative is confirming a
 * rollout on a timestamp we could not read. On the BASELINE it is equally safe
 * in the other direction: an unreadable baseline means any real observation
 * counts as newer, and a stale `ROUTED` cannot have a readable timestamp while
 * the baseline that captured that same value does not.
 */
export function parseInstant(raw: string | null): number | null {
  if (raw === null || raw.length === 0) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}
