import { NPM_LOCKFILE_NAMES, rewriteLockfileToVendoredTarball } from "@nexus/vibe-app-vendoring";

import type { AppFiles, Leg, VendorPlan } from "./vendor-plan";

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
export function planLockfile(input: {
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
