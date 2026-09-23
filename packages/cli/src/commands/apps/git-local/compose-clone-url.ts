/**
 * Token-free clone URL for a project: `<cloneUrlBase><name>.git`.
 *
 * `cloneUrlBase` is documented as ending in `/<org>/`, but a base that lost its
 * trailing slash would silently produce `…/orgmy-lib.git`, so normalise rather
 * than trust it.
 *
 * TOKEN-FREE is the load-bearing word — `credential-parts.ts` carries why. This
 * is the URL git is allowed to write into `.git/config`; the secret travels by
 * `compose-credential-line.ts` and a 0600 file instead.
 */
export function composeCloneUrl(cloneUrlBase: string, projectName: string): string {
  const base = cloneUrlBase.endsWith("/") ? cloneUrlBase : `${cloneUrlBase}/`;
  return `${base}${projectName}.git`;
}
