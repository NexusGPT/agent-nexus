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
 * The decisions live in `plan-vendoring.ts`, the work in
 * `vendor-package.handler.ts`; this is the commander wiring and nothing else.
 */

import type { Command } from "commander";

import { handleError } from "../../../errors";
import type { TenantHttpOptions } from "../../../util/tenant-http";
import { runVendorPackage } from "./vendor-package.handler";

const VENDOR_PACKAGE_HELP = `
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
`;

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
    .addHelpText("after", VENDOR_PACKAGE_HELP)
    .action(
      async (packageArg: string | undefined, cmdOpts: { dir: string; packageVersion: string }) => {
        try {
          await runVendorPackage(resolveTenantOpts, packageArg, cmdOpts);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
}
