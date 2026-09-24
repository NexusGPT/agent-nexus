/**
 * Vendoring a private npm package INTO an app, so a machine with no registry
 * credential can install it.
 *
 * These functions are pure and live here rather than in either consumer because
 * BOTH sides have to agree on the result byte-for-byte: the backend assembles a
 * starter bundle with them, and the CLI applies the same rewrite to an app that
 * already exists on a customer's disk. A manifest rewritten by one spelling and
 * a file written by another produce an `npm install` that fails on a missing
 * local path, with both halves looking correct read on their own.
 *
 * Nothing here reaches a network or a registry credential. Resolving a version
 * and fetching bytes is the server's job precisely because the credential must
 * not leave it; deciding what the app's files should then SAY is this module's.
 */

export type {
  LockfileReadOutcome,
  LockfileRewriteOutcome,
  LockfileSkipReason
} from "./rewrite-lockfile-dependency";
export {
  lockedVersionOf,
  NPM_LOCKFILE_NAMES,
  rewriteLockfileToVendoredTarball,
  sha512Integrity
} from "./rewrite-lockfile-dependency";
export type {
  RewritableDependencyField,
  RewriteManifestOptions,
  RewriteManifestOutcome
} from "./rewrite-manifest-dependency";
export { rewriteManifestToVendoredTarball } from "./rewrite-manifest-dependency";
export type { VendorIntoDockerfileOutcome } from "./vendor-into-dockerfile";
export { VENDOR_COPY_LINE, vendorIntoDockerfile } from "./vendor-into-dockerfile";
export {
  VENDOR_DIRECTORY,
  vendoredTarballFilename,
  vendoredTarballPath,
  vendoredTarballSpec
} from "./vendored-tarball-path";
