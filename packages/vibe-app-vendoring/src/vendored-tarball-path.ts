/**
 * Where a vendored npm tarball sits inside an app, relative to the directory
 * holding its `package.json`.
 *
 * The basename is npm's OWN packed-tarball convention — `npm pack
 * @agent-nexus/apps-ui` writes `agent-nexus-apps-ui-0.8.4.tgz` — so a file
 * fetched from the registry and a file packed locally land on the same name and
 * a reader can tell what a `vendor/` entry is without opening it.
 *
 * This convention is the contract between the SERVER that serves the tarball
 * and the CLIENT that writes it, and it is spelled once here because a manifest
 * rewritten to one spelling and a file written to another produce an
 * `npm install` that fails on a missing local path — with both halves looking
 * correct in isolation.
 */

/** The directory every vendored tarball goes in, relative to the app root. */
export const VENDOR_DIRECTORY = "vendor";

/**
 * npm's packed-tarball basename for a package version: the scope's `@` is
 * dropped and its `/` becomes `-`, so `@agent-nexus/apps-ui` at `0.8.4` is
 * `agent-nexus-apps-ui-0.8.4.tgz`. An unscoped name is unchanged.
 */
export function vendoredTarballFilename(packageName: string, version: string): string {
  const flattened = packageName.replace(/^@/, "").replace(/\//g, "-");
  return `${flattened}-${version}.tgz`;
}

/**
 * The app-relative path of a vendored tarball — the exact string a manifest's
 * `file:` dependency and a lockfile's `resolved` both point at.
 */
export function vendoredTarballPath(packageName: string, version: string): string {
  return `${VENDOR_DIRECTORY}/${vendoredTarballFilename(packageName, version)}`;
}

/** The `file:` dependency spec npm resolves to {@link vendoredTarballPath}. */
export function vendoredTarballSpec(packageName: string, version: string): string {
  return `file:${vendoredTarballPath(packageName, version)}`;
}
