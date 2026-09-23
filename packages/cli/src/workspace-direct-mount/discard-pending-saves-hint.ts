/** The remedy every dirty-cache refusal ends with: where the unsent bytes sit, and what deleting them means. */
export function discardPendingSavesHint(cacheDir: string): string {
  return `copy them out of ${cacheDir}/vfs and delete ${cacheDir} to discard them`;
}
