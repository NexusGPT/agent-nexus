import { failure } from "../errors";
import { cacheProvenanceRefusal } from "./cache-provenance-refusal";
import { discardPendingSavesHint } from "./discard-pending-saves-hint";
import { mountFix } from "./mount-fix";
import type { SessionPaths } from "./session-paths";

/**
 * Refuse a cache left by the OTHER copy of this slug, BEFORE the mint, because
 * it is a local fact and a refusal here costs no credential: the saves in it
 * must not be drained into this workspace. The mount id cannot tell the two
 * copies apart — it hashes `<kind>:<id>|<slug>`, and the org-owned and
 * admin-shared workspaces differ only in a field that key never carries — so
 * the cache states its own provenance and this reads it.
 */
export function refuseWrongCacheCopy(paths: SessionPaths, shared: boolean, slug: string): void {
  const wrongCopy = cacheProvenanceRefusal(paths, shared, slug);
  if (wrongCopy === null) return;
  throw failure(
    "local-failed",
    wrongCopy,
    `Mount the other copy so they upload — ${mountFix(slug, !shared, "direct")} — or ${discardPendingSavesHint(paths.cacheDir)}.`
  );
}
