/** The codeload URL a `<owner>/<repo>` + git ref resolves to. */
export function presetTarballUrl(repo: string, ref: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`--repo must look like "owner/name", got "${repo}"`);
  }
  return `https://codeload.github.com/${repo}/tar.gz/${encodeURIComponent(ref)}`;
}
