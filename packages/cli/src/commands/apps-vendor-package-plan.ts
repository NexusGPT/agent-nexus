/**
 * Every DECISION `nexus apps vendor-package` makes, as pure functions over file
 * contents.
 *
 * Split from the command for the reason `apps-git-local.ts` is: the three
 * rewrites — manifest, lockfile, Dockerfile — have to agree with each other and
 * with the vendored tarball's filename, and the only way to prove they do is to
 * run them over a fixture and read the result. Nothing here touches a disk or a
 * network, so a test needs neither.
 */

import {
  NPM_LOCKFILE_NAMES,
  rewriteLockfileToVendoredTarball,
  rewriteManifestToVendoredTarball,
  VENDOR_DIRECTORY,
  vendoredTarballFilename,
  vendorIntoDockerfile
} from "@nexus/vibe-app-vendoring";

/** The packages this verb will vendor. Mirrors the contract's closed list. */
export const VENDORABLE_PACKAGES = ["@agent-nexus/apps-ui"] as const;
export const DEFAULT_VENDORABLE_PACKAGE = "@agent-nexus/apps-ui";

/** Exact semver or `latest` — the only spellings the endpoint accepts. */
const PACKAGE_VERSION_SPEC =
  /^(latest|(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?)$/;

export function isPackageVersionSpec(value: string): boolean {
  return PACKAGE_VERSION_SPEC.test(value);
}

export function isVendorablePackage(name: string): boolean {
  return (VENDORABLE_PACKAGES as readonly string[]).includes(name);
}

/** Everything the plan reads. `null` means the file is not there. */
export interface AppFiles {
  readonly packageJson: string;
  /** The EFFECTIVE lockfile — the first of {@link NPM_LOCKFILE_NAMES} present. */
  readonly lockfile: { readonly name: string; readonly raw: string } | null;
  readonly dockerfile: string | null;
  /** Filenames already in `vendor/`, so a superseded tarball can be removed. */
  readonly vendorEntries: readonly string[];
}

export interface VendorWrite {
  /** App-relative path. */
  readonly path: string;
  readonly content: string;
}

export interface VendorPlan {
  readonly writes: readonly VendorWrite[];
  /** App-relative paths to delete — a superseded tarball of the SAME package. */
  readonly removals: readonly string[];
  /** Lines to show the user. Each names something they may have to act on. */
  readonly warnings: readonly string[];
  /** What the user must run next for the tree to be consistent. */
  readonly nextCommand: "npm install" | "npm ci";
}

export type VendorPlanOutcome = { ok: true; plan: VendorPlan } | { ok: false; reason: string };

/**
 * Decides every file change vendoring `packageName@version` into an app
 * requires, from the app's current contents alone.
 */
export function planVendoring(input: {
  files: AppFiles;
  packageName: string;
  version: string;
  integrity: string;
}): VendorPlanOutcome {
  const { files, packageName, version, integrity } = input;
  const writes: VendorWrite[] = [];
  const warnings: string[] = [];

  const manifest = rewriteManifestToVendoredTarball(files.packageJson, packageName, version, {
    addWhenAbsent: true
  });
  if (!manifest.ok) return { ok: false, reason: manifest.reason };
  writes.push({ path: "package.json", content: manifest.content });

  const lock = planLockfile({ files, packageName, version, integrity });
  if (!lock.ok) return lock;
  writes.push(...lock.writes);
  warnings.push(...lock.warnings);

  const docker = planDockerfile(files.dockerfile);
  writes.push(...docker.writes);
  warnings.push(...docker.warnings);

  return {
    ok: true,
    plan: {
      writes,
      removals: supersededVendorEntries(files.vendorEntries, packageName, version),
      warnings,
      nextCommand: lock.nextCommand
    }
  };
}

interface Leg {
  readonly writes: readonly VendorWrite[];
  readonly warnings: readonly string[];
}

/**
 * Re-points the lockfile, or explains why it was left alone.
 *
 * A lockfile that cannot be re-pointed is not an error — it is the ordinary
 * shape of an UPGRADE, where the resolved tree genuinely changes and only npm
 * can re-resolve it. What matters is that the caller is told which command
 * leaves them consistent, because `npm ci` on a stale lockfile fails in the
 * customer's OWN CI rather than here, where nothing names this command as the
 * cause.
 */
function planLockfile(input: {
  files: AppFiles;
  packageName: string;
  version: string;
  integrity: string;
}): (Leg & { ok: true; nextCommand: VendorPlan["nextCommand"] }) | { ok: false; reason: string } {
  const { files, packageName, version, integrity } = input;
  if (files.lockfile === null) {
    return {
      ok: true,
      writes: [],
      nextCommand: "npm install",
      warnings: [
        `No lockfile found. Run \`npm install\` and commit the ${NPM_LOCKFILE_NAMES[1]} it writes — ` +
          "a build that runs `npm ci` needs one."
      ]
    };
  }

  const lock = rewriteLockfileToVendoredTarball({
    raw: files.lockfile.raw,
    packageName,
    version,
    integrity
  });
  if (!lock.ok) return { ok: false, reason: `${files.lockfile.name}: ${lock.reason}` };
  if (lock.content !== null) {
    return {
      ok: true,
      writes: [{ path: files.lockfile.name, content: lock.content }],
      warnings: [],
      nextCommand: "npm ci"
    };
  }
  return {
    ok: true,
    writes: [],
    nextCommand: "npm install",
    warnings: [
      lock.skipped.kind === "not-pinned"
        ? `${files.lockfile.name} has no entry for ${packageName}, so it could not be re-pointed. ` +
          "Run `npm install` to write one, and commit it."
        : `${files.lockfile.name} pins ${packageName}@${lock.skipped.lockedVersion}, not ${version}. ` +
          "Re-pointing one entry cannot re-resolve that package's own dependencies, so the " +
          "lockfile is left alone. Run `npm install` to re-resolve it, and commit it."
    ]
  };
}

/**
 * Makes the app's image build see `vendor/`, or says why it may not.
 *
 * This is the half that does NOT fail on the developer's machine: `npm install`
 * in the app directory works whatever the Dockerfile says, so a missing `COPY`
 * surfaces on the first server-side build — after the change has been pushed.
 */
function planDockerfile(dockerfile: string | null): Leg {
  if (dockerfile === null) {
    // A repo with no Dockerfile is built from one the platform GENERATES, and
    // that one copies the manifests it knows about and nothing else.
    return {
      writes: [],
      warnings: [
        "This app has no Dockerfile, so the platform generates one at build time — and a generated " +
          `build copies only the manifests before installing, not \`${VENDOR_DIRECTORY}/\`. ` +
          "Add a Dockerfile that copies it before the install step, or the server-side build will " +
          "fail on a missing file even though the install here succeeds."
      ]
    };
  }
  const outcome = vendorIntoDockerfile(dockerfile);
  return {
    writes:
      outcome.content === dockerfile ? [] : [{ path: "Dockerfile", content: outcome.content }],
    warnings: outcome.installsNothing
      ? [
          "Dockerfile has no recognised dependency-install step, so nothing was added to it. " +
            `If the image installs dependencies some other way, it must copy \`${VENDOR_DIRECTORY}/\` ` +
            "into the build context before that step, or the build will fail on a missing file."
        ]
      : []
  };
}

/**
 * Tarballs of the SAME package at another version.
 *
 * An upgrade otherwise leaves the previous one behind, where it reads as a
 * second live version of the library and rides along in every clone of the
 * repository. Scoped to the package being vendored: another package's tarball
 * in `vendor/` is somebody else's dependency, not litter.
 */
function supersededVendorEntries(
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
