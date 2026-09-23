/**
 * A cache that is present and cannot be read.
 *
 * 🔴 INFINITE ON PURPOSE, and the reason is that the two decision sites compare
 * in OPPOSITE directions: one refuses unless the count `=== 0`, the other
 * refuses when it is `> 0`. A finite sentinel is safe at one and wrong at the
 * other — `-1` passes the `> 0` gate and deletes the cache. Only a value that is
 * both non-zero and greater than zero fails safe at both, so an unreadable cache
 * is "more saves than you can lose" rather than a number.
 *
 * {@link describePendingUploads} is how it reaches a human; `JSON.stringify`
 * renders it `null`, which is the right answer for a count nobody knows.
 */
export const PENDING_UPLOADS_UNKNOWN = Number.POSITIVE_INFINITY;

/** How a pending-upload count is spoken: a number, or the honest non-answer. */
export function describePendingUploads(count: number): string {
  return count === PENDING_UPLOADS_UNKNOWN ? "An unknown number of" : String(count);
}
