import path from "node:path";

/** The one wording for "take your unsent saves out of the cache, then delete it" — joined by the host's `path`, so Windows reads `\` throughout. */
export function discardPendingSavesHint(cacheDir: string): string {
  return `copy them out of ${path.join(cacheDir, "vfs")} and delete ${cacheDir} to discard them`;
}
