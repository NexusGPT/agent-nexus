import { VIBE_LOG_CLI_DEFAULT_LIMIT, VIBE_LOG_CLI_MAX_LIMIT } from "./log-limits";

export function parseLimitFlag(raw: string | undefined): number {
  if (raw === undefined) return VIBE_LOG_CLI_DEFAULT_LIMIT;

  // `Number("")` and `Number("  ")` are BOTH 0 — an integer — so an empty flag
  // would otherwise sail past the shape check and be reported as a bound
  // problem: `--limit must be between 1 and 1000 (got )`, which names neither
  // what was typed nor what is wrong with it. Refused here as the typo it is.
  const trimmed = raw.trim();
  const parsed = trimmed.length === 0 ? Number.NaN : Number(trimmed);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--limit must be a whole number (got "${raw}").`);
  }
  if (parsed < 1 || parsed > VIBE_LOG_CLI_MAX_LIMIT) {
    throw new Error(
      `--limit must be between 1 and ${String(VIBE_LOG_CLI_MAX_LIMIT)} (got ${raw}).`
    );
  }
  return parsed;
}
