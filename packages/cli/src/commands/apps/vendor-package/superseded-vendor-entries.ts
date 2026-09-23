import { VENDOR_DIRECTORY, vendoredTarballFilename } from "@nexus/vibe-app-vendoring";

/**
 * Tarballs of the SAME package at another version.
 *
 * An upgrade otherwise leaves the previous one behind, where it reads as a
 * second live version of the library and rides along in every clone of the
 * repository. Scoped to the package being vendored: another package's tarball
 * in `vendor/` is somebody else's dependency, not litter.
 */
export function supersededVendorEntries(
  entries: readonly string[],
  packageName: string,
  version: string
): string[] {
  const keep = vendoredTarballFilename(packageName, version);
  // `<flattened-name>-` — the filename minus the version and extension.
  const prefix = vendoredTarballFilename(packageName, "").slice(0, -".tgz".length);
  return entries
    .filter((entry) => entry !== keep && entry.startsWith(prefix) && entry.endsWith(".tgz"))
    .map((entry) => `${VENDOR_DIRECTORY}/${entry}`);
}
