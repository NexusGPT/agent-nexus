const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "12s", "41m", "3h", "2d" — the coarsest unit that is at least one. */
export function coarseDuration(ms: number): string {
  if (ms >= DAY_MS) return `${Math.floor(ms / DAY_MS)}d`;
  if (ms >= HOUR_MS) return `${Math.floor(ms / HOUR_MS)}h`;
  if (ms >= MINUTE_MS) return `${Math.floor(ms / MINUTE_MS)}m`;
  return `${Math.max(0, Math.floor(ms / 1000))}s`;
}
