// ============================================================
// Helpers
// ============================================================

export function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return 50;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(`Invalid --limit "${raw}". Expected an integer in [1, 100].`);
  }
  return parsed;
}
