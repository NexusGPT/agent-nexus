/**
 * `"38 completed, 1 failed"` from a `nodeStatusCounts`-shaped object, or `null`
 * when nothing is worth printing.
 *
 * Keys are already the lowercase public buckets. This used to lowercase them
 * itself, which quietly papered over `diagnose` returning `COMPLETED` where
 * every other command returned `completed` (NEX-3176) — the display looked
 * right while `--json` consumers read `undefined`.
 */
export function summarizeCounts(counts: unknown): string | null {
  if (typeof counts !== "object" || counts === null || Array.isArray(counts)) return null;
  const parts = Object.entries(counts as Record<string, unknown>)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([k, v]) => `${v as number} ${k}`);
  return parts.length > 0 ? parts.join(", ") : null;
}
