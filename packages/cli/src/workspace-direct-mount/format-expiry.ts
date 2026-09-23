import { coarseDuration } from "./coarse-duration";
import { formatAgo } from "./format-ago";

/** "in 41m" while the instant is ahead, "expired 3m ago" once it is behind. */
export function formatExpiry(expiresAt: string, now: Date): string {
  const leftMs = new Date(expiresAt).getTime() - now.getTime();
  if (leftMs > 0) return `in ${coarseDuration(leftMs)}`;
  return `expired ${formatAgo(expiresAt, now)}`;
}
