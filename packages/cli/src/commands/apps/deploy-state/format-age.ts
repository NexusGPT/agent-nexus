/**
 * A coarse age, for a timestamp whose PRECISION does not matter but whose
 * STALENESS does. "3m ago" is the fact a reader needs about an observation;
 * "3m 41s ago" invites them to trust it more than they should.
 *
 * A negative span (clock skew between this machine and the platform) renders as
 * "just now" rather than as a negative number — the alternative reads as a
 * corrupted answer when it is a corrupted clock.
 */
export function formatAge(ms: number): string {
  if (ms < 0) return "just now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${String(seconds)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${String(hours)}h ago`;
  return `${String(Math.floor(hours / 24))}d ago`;
}
