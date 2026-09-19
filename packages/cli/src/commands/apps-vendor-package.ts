/**
 * `nexus apps vendor-package` — vendor a private `@agent-nexus/*` package into
 * an app that ALREADY EXISTS, so `npm install` and `npm ci` stop asking a
 * registry this machine cannot authenticate to.
 *
 * `nexus apps starter` covers the first command of a build and nothing after
 * it. An app scaffolded before that command existed, cloned from the org's git
 * host, or simply built over weeks resolves the component library FROM THE
 * REGISTRY in its own `package.json` — so every later install 404s, and the
 * only apparent way out is an npm token the user does not have and must never
 * be asked for. This command is the way out: the backend spends the platform's
 * credential and serves the published tarball, and this writes it into the app.
 *
 * The decisions live in `apps-vendor-package-plan.ts`; this is the IO shell.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  NPM_LOCKFILE_NAMES,
  VENDOR_DIRECTORY,
  vendoredTarballFilename
} from "@nexus/vibe-app-vendoring";
import type { Command } from "commander";

import { handleError, refuse, reportFailure } from "../errors";
import { color, isJsonMode } from "../output";
import { tenantDownload, type TenantHttpOptions } from "../util/tenant-http";
import {
  type AppFiles,
  DEFAULT_VENDORABLE_PACKAGE,
  isPackageVersionSpec,
  isVendorablePackage,
  planVendoring,
  VENDORABLE_PACKAGES,
  type VendorPlan
} from "./apps-vendor-package-plan";

/** The route, and the headers it echoes the resolved package in. */
export const APP_PACKAGE_PATH = "/api/vibe/app-package" as const;
export const APP_PACKAGE_NAME_HEADER = "x-nexus-app-package-name" as const;
export const APP_PACKAGE_VERSION_HEADER = "x-nexus-app-package-version" as const;
export const APP_PACKAGE_INTEGRITY_HEADER = "x-nexus-app-package-integrity" as const;

function readIfPresent(path: string): string | null {
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : null;
}

export type ReadAppFilesOutcome = { ok: true; files: AppFiles } | { ok: false; reason: string };

/** Reads the app's current state. Refuses a directory that is not a Node app. */
export function readAppFiles(dir: string): ReadAppFilesOutcome {
  const packageJson = readIfPresent(join(dir, "package.json"));
  if (packageJson === null) {
    return { ok: false, reason: `${dir} has no package.json — it is not a Node app directory.` };
  }

  let lockfile: AppFiles["lockfile"] = null;
  for (const name of NPM_LOCKFILE_NAMES) {
    const raw = readIfPresent(join(dir, name));
    // The FIRST present wins, exactly as npm reads them: a shadowed lockfile is
    // one npm never opens, so rewriting it would change a file nothing reads
    // while leaving the file that IS read disagreeing with the manifest.
    if (raw !== null) {
      lockfile = { name, raw };
      break;
    }
  }

  const vendorDir = join(dir, VENDOR_DIRECTORY);
  const vendorEntries =
    existsSync(vendorDir) && statSync(vendorDir).isDirectory() ? readdirSync(vendorDir) : [];

  return {
    ok: true,
    files: {
      packageJson,
      lockfile,
      dockerfile: readIfPresent(join(dir, "Dockerfile")),
      vendorEntries
    }
  };
}

function applyPlan(dir: string, plan: VendorPlan, tarball: { name: string; bytes: Buffer }): void {
  // The tarball goes down FIRST: every rewrite below points at it, so a run that
  // dies in the middle leaves a manifest whose target exists rather than one
  // pointing at nothing.
  mkdirSync(join(dir, VENDOR_DIRECTORY), { recursive: true });
  writeFileSync(join(dir, VENDOR_DIRECTORY, tarball.name), tarball.bytes);
  for (const write of plan.writes) {
    mkdirSync(dirname(join(dir, write.path)), { recursive: true });
    writeFileSync(join(dir, write.path), write.content);
  }
  for (const removal of plan.removals) rmSync(join(dir, removal), { force: true });
}

interface VendorResult {
  directory: string;
  packageName: string;
  version: string;
  integrity: string;
  vendoredPath: string;
  changed: string[];
  removed: string[];
  warnings: string[];
  nextCommand: string;
}

function printResult(result: VendorResult): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `${color.green("✓")} ${result.packageName}@${result.version} vendored to ${result.vendoredPath}`
  );
  for (const path of result.changed) console.log(`  ${color.dim("updated")} ${path}`);
  for (const path of result.removed) console.log(`  ${color.dim("removed")} ${path}`);
  for (const warning of result.warnings) console.log(`${color.yellow("!")} ${warning}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  ${result.nextCommand}`);
  console.log(`  git add ${VENDOR_DIRECTORY}/ package.json package-lock.json && git commit`);
  console.log("");
  console.log(
    color.dim(
      "No npm token is needed and none should ever be requested: the package installs from " +
        `${VENDOR_DIRECTORY}/, not the registry. Commit that directory — the server-side build reads it too.`
    )
  );
}

export function registerVendorPackageCommand(
  apps: Command,
  resolveTenantOpts: () => TenantHttpOptions
): void {
  apps
    .command("vendor-package [package]")
    .description("Vendor a private @agent-nexus package into an EXISTING app — no npm token needed")
    .option("--dir <dir>", "App directory (default: the current directory)", ".")
    .option(
      "--package-version <version>",
      "Exact version to vendor (e.g. 0.8.4), or 'latest'",
      "latest"
    )
    .addHelpText(
      "after",
      `
Downloads a private @agent-nexus package with the platform's own registry
credential and writes it into an app that already exists:

  vendor/<name>-<version>.tgz        the published tarball, byte-for-byte
  package.json                       the dependency repointed to file:vendor/...
  package-lock.json                  re-pointed when it already pins this version
  Dockerfile                         a COPY vendor/ before each install step

Use this whenever an app needs a private @agent-nexus package and "nexus apps
starter" does not apply — the app already exists, was cloned, or is upgrading
the library. NEVER ask the user for an npm token: they cannot have one, and
this command is why they do not need one.

The flag is --package-version, not --version: --version is the CLI's own
version flag and would print that instead.

Examples:
  $ nexus apps vendor-package
  $ nexus apps vendor-package @agent-nexus/apps-ui --package-version 0.8.4
  $ nexus apps vendor-package --dir ./my-app

Notes:
  Requires the VIBE feature on your org and, for an org API key, the vibe:read
  scope.

  Commit vendor/ along with package.json and the lockfile. The server-side
  build installs from the repository, so a vendored tarball that is not
  committed fails the build and not this command.

  --json prints the full result, including every file changed and every warning.
`
    )
    .action(
      async (packageArg: string | undefined, cmdOpts: { dir: string; packageVersion: string }) => {
        try {
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
            process.exitCode = refuse(
              read.reason,
              "Run this from the app directory, or pass --dir."
            );
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
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
}
