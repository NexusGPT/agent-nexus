/**
 * The prefix segments this command prepends, longest first.
 *
 * 🚨 LONGEST FIRST IS LOAD-BEARING. `/api/public/v1/models` starts with `/api`
 * as well, and matching the short form would report the prefix as `/api` and
 * name `/public/v1/models` as the correction — which is still wrong and would
 * be refused a second time. A caller who pastes a full path deserves ONE
 * refusal that names the path they meant.
 */
export const REDUNDANT_PREFIXES = ["/api/public/v1", "/public/v1", "/api/v1", "/v1"] as const;

/**
 * Is this `<path>` carrying the prefix this command already prepends?
 *
 * ⚠️ THE ANSWER IS SAFE BECAUSE NO v1 ROUTE BEGINS WITH ANY OF THESE SEGMENTS.
 * Derived, not assumed: every descriptor path in
 * `packages/types/src/api/public/v1/contract/` begins `/public/v1/`, and the
 * segment that follows is a resource name — none of the 304 is `api`, `public`
 * or `v1`. So `/api/...` and `/v1/...` cannot be a real path relative to the
 * prefix, and refusing them costs no legitimate call. A route that ever adds
 * one would need this list narrowed in the same commit.
 *
 * A trailing boundary is required (`/` or end of string) so `/videos` is not
 * read as `/v1` plus `deos`.
 */
export function redundantPrefix(
  normalizedPath: string
): { prefix: string; corrected: string } | null {
  for (const prefix of REDUNDANT_PREFIXES) {
    if (normalizedPath !== prefix && !normalizedPath.startsWith(`${prefix}/`)) continue;
    const rest = normalizedPath.slice(prefix.length);
    return { prefix, corrected: rest === "" ? "/" : rest };
  }
  return null;
}
