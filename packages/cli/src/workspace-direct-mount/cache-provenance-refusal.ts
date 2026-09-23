import { cacheHoldsEntries } from "./cache-holds-entries";
import { readCacheOwner } from "./cache-owner";
import type { SessionPaths } from "./session-paths";

/**
 * The refusal when a leftover cache belongs to the OTHER copy of this slug, or
 * null when it may be reused. Silent on an empty cache: with nothing to drain
 * there is nothing to misdeliver, and the stale marker is simply overwritten.
 */
export function cacheProvenanceRefusal(
  paths: Pick<SessionPaths, "cacheDir" | "cacheOwnerFile">,
  shared: boolean,
  slug: string
): string | null {
  const owner = readCacheOwner(paths.cacheOwnerFile);
  if (owner === null || owner.shared === shared) return null;
  if (!cacheHoldsEntries(paths.cacheDir)) return null;
  const held = owner.shared ? "the admin-shared" : "your organization's own";
  const wanted = shared ? "the admin-shared" : "your organization's own";
  return (
    `The cache for "${slug}" holds unsent saves from ${held} copy, and this mount is ${wanted} copy. ` +
    `Uploading them here would put them in the wrong workspace.`
  );
}
