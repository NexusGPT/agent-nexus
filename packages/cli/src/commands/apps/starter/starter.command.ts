/**
 * `nexus apps starter <dir>` — download the org app starter as ONE bundle and
 * extract it, so a machine with no npm credential can start an app.
 *
 * Both packages the starter needs (`@agent-nexus/apps-starter` and the
 * `@agent-nexus/apps-ui` library it depends on) are private. The backend
 * fetches them with the platform's own registry credential and serves a single
 * tarball in which the library is vendored under `vendor/` as a `file:`
 * dependency, so the `npm install` that follows never asks the registry for a
 * private package. No npm token ever reaches this machine.
 */

import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import type { Command } from "commander";

import { handleError, refuse, reportFailure } from "../../../errors";
import { tenantDownload, type TenantHttpOptions } from "../../../util/tenant-http";
import { extractBundle } from "./extract-bundle";
import { isStarterVersionSpec } from "./is-starter-version-spec";
import { judgeTargetDirectory } from "./judge-target-directory";
import { printStarterResult } from "./print-starter-result";
import {
  APP_STARTER_PATH,
  APP_STARTER_UI_VERSION_HEADER,
  APP_STARTER_VERSION_HEADER
} from "./wire";

const STARTER_HELP = `
Downloads @agent-nexus/apps-starter with @agent-nexus/apps-ui already inside it
(vendor/agent-nexus-apps-ui-<version>.tgz, wired as a file: dependency), and
extracts it into <dir>. Both packages are private; the platform fetches them
for you, so this machine never needs an npm token or an .npmrc.

<dir> is created if it does not exist. An existing <dir> must be empty — the
command refuses rather than extract over your files.

The flag is --starter-version, not --version: --version is the CLI's own
version flag and would print that instead.

Examples:
  $ nexus apps starter my-app
  $ nexus apps starter my-app --starter-version 0.3.1
  $ cd my-app && npm install

Notes:
  Requires the VIBE feature on your org and, for an org API key, the vibe:read
  scope.

  The bundle ships no package-lock.json (npm pack never includes one), so the
  first "npm install" writes it, recording the vendored tarball's integrity.
  Commit it: the starter's Dockerfile runs "npm ci", which needs it.

  --json prints { directory, starterVersion, uiVersion, bytes }.
`;

export function registerStarterCommand(
  apps: Command,
  resolveTenantOpts: () => TenantHttpOptions
): void {
  apps
    .command("starter <dir>")
    .description(
      "Download the org app starter into <dir>, UI library vendored — no npm token needed"
    )
    .option(
      "--starter-version <version>",
      "Exact starter version to fetch (e.g. 0.3.1), or 'latest'",
      "latest"
    )
    .addHelpText("after", STARTER_HELP)
    .action(async (dir: string, cmdOpts: { starterVersion: string }) => {
      try {
        if (!isStarterVersionSpec(cmdOpts.starterVersion)) {
          process.exitCode = refuse(
            `--starter-version must be an exact version like 0.3.1, or 'latest' (got "${cmdOpts.starterVersion}").`
          );
          return;
        }
        const target = resolve(dir);
        const verdict = judgeTargetDirectory(target);
        if (!verdict.ok) {
          process.exitCode = refuse(
            verdict.reason,
            "Pick a new directory name, or empty this one first."
          );
          return;
        }

        const download = await tenantDownload(resolveTenantOpts(), {
          path: APP_STARTER_PATH,
          query: { version: cmdOpts.starterVersion }
        });

        if (verdict.create) mkdirSync(target, { recursive: true });
        try {
          extractBundle(download.bytes, target);
        } catch (err) {
          // Leave nothing half-extracted behind in a directory this command made.
          if (verdict.create) rmSync(target, { recursive: true, force: true });
          const detail = err instanceof Error ? err.message : String(err);
          process.exitCode = reportFailure(
            "local-failed",
            `Could not extract the starter into ${target}: ${detail}`,
            "The system `tar` must be on PATH."
          );
          return;
        }

        printStarterResult(
          {
            directory: target,
            starterVersion: download.headers.get(APP_STARTER_VERSION_HEADER),
            uiVersion: download.headers.get(APP_STARTER_UI_VERSION_HEADER),
            bytes: download.bytes.length
          },
          dir
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
