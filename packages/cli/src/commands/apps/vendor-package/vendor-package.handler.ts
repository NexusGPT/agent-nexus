import { resolve } from "node:path";

import { VENDOR_DIRECTORY, vendoredTarballFilename } from "@nexus/vibe-app-vendoring";

import { refuse, reportFailure } from "../../../errors";
import { tenantDownload, type TenantHttpOptions } from "../../../util/tenant-http";
import { applyPlan } from "./apply-plan";
import { isPackageVersionSpec } from "./is-package-version-spec";
import { planVendoring } from "./plan-vendoring";
import { printResult } from "./print-result";
import { readAppFiles } from "./read-app-files";
import {
  DEFAULT_VENDORABLE_PACKAGE,
  isVendorablePackage,
  VENDORABLE_PACKAGES
} from "./vendorable-packages";
import {
  APP_PACKAGE_INTEGRITY_HEADER,
  APP_PACKAGE_NAME_HEADER,
  APP_PACKAGE_PATH,
  APP_PACKAGE_VERSION_HEADER
} from "./wire";

/**
 * The whole of `apps vendor-package`, minus the commander wiring: validate,
 * read the app, fetch the tarball, plan, write, report.
 *
 * Sets `process.exitCode` on every refusal exactly as the command's own action
 * callback did, rather than returning a code for the caller to assign: the
 * exit-code gates in `src/exit-code-taxonomy.test.ts` and
 * `src/every-zero-exit-path-is-ledgered.test.ts` read these assignments
 * statically, so the statement SHAPE is load-bearing and not a style choice.
 */
export async function runVendorPackage(
  resolveTenantOpts: () => TenantHttpOptions,
  packageArg: string | undefined,
  cmdOpts: { dir: string; packageVersion: string }
): Promise<void> {
  const packageName = packageArg ?? DEFAULT_VENDORABLE_PACKAGE;
  if (!isVendorablePackage(packageName)) {
    process.exitCode = refuse(
      `${packageName} is not a package this command can vendor.`,
      `Vendorable packages: ${VENDORABLE_PACKAGES.join(", ")}.`
    );
    return;
  }
  if (!isPackageVersionSpec(cmdOpts.packageVersion)) {
    process.exitCode = refuse(
      `--package-version must be an exact version like 0.8.4, or 'latest' (got "${cmdOpts.packageVersion}").`
    );
    return;
  }

  const dir = resolve(cmdOpts.dir);
  const read = readAppFiles(dir);
  if (!read.ok) {
    process.exitCode = refuse(read.reason, "Run this from the app directory, or pass --dir.");
    return;
  }

  const download = await tenantDownload(resolveTenantOpts(), {
    path: APP_PACKAGE_PATH,
    query: { package: packageName, version: cmdOpts.packageVersion }
  });
  const version = download.headers.get(APP_PACKAGE_VERSION_HEADER);
  const integrity = download.headers.get(APP_PACKAGE_INTEGRITY_HEADER);
  const resolvedName = download.headers.get(APP_PACKAGE_NAME_HEADER) ?? packageName;
  if (version === null || integrity === null) {
    // Without both, the lockfile entry this writes would be a guess —
    // and a guessed integrity fails `npm ci` with a corruption error
    // naming the registry, which points every reader at the wrong system.
    process.exitCode = reportFailure(
      "local-failed",
      "The server did not report the resolved version and integrity of the package.",
      "Run `nexus upgrade`; this needs a backend that serves the x-nexus-app-package-* headers."
    );
    return;
  }

  const planned = planVendoring({
    files: read.files,
    packageName: resolvedName,
    version,
    integrity
  });
  if (!planned.ok) {
    process.exitCode = refuse(
      `Cannot vendor ${resolvedName} into ${dir}: ${planned.reason}`,
      "Fix the file it names, then run this again."
    );
    return;
  }

  const filename = vendoredTarballFilename(resolvedName, version);
  applyPlan(dir, planned.plan, { name: filename, bytes: download.bytes });

  printResult({
    directory: dir,
    packageName: resolvedName,
    version,
    integrity,
    vendoredPath: `${VENDOR_DIRECTORY}/${filename}`,
    changed: planned.plan.writes.map((write) => write.path),
    removed: [...planned.plan.removals],
    warnings: [...planned.plan.warnings],
    nextCommand: planned.plan.nextCommand
  });
}
