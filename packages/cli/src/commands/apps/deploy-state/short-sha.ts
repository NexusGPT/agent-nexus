/** The 7-character prefix every `apps` surface abbreviates a commit to. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
