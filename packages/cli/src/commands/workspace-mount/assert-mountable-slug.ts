/** Workspace slugs are slugified server-side: lowercase alphanumeric + hyphens. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Reject anything that isn't a real workspace slug before it reaches
 * `path.join`/`path.resolve` (mount point) or the mount URL. Without this a
 * slug like `..` or `../foo` resolves the mount point outside `~/nexus`.
 */
export function assertMountableSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid workspace slug "${slug}". Slugs are lowercase letters, digits, and hyphens. ` +
        `Run \`nexus workspace list\` to see valid slugs.`
    );
  }
}
