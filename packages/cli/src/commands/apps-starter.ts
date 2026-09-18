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
 *
 * Split out of `apps.ts` for the same reason `apps-git-local.ts` is: the
 * decisions are pure and tested on their own, and the IO is a thin shell.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Command } from "commander";

import { handleError, refuse, reportFailure } from "../errors";
import { color, isJsonMode } from "../output";
import { tenantDownload, type TenantHttpOptions } from "../util/tenant-http";

/** The route, and the headers it echoes the resolved versions in. */
export const APP_STARTER_PATH = "/api/vibe/app-starter" as const;
export const APP_STARTER_VERSION_HEADER = "x-nexus-apps-starter-version" as const;
export const APP_STARTER_UI_VERSION_HEADER = "x-nexus-apps-ui-version" as const;

/** Exact semver or `latest` — the only spellings the endpoint accepts. */
const STARTER_VERSION_SPEC =
  /^(latest|(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?)$/;

export type TargetDirectoryVerdict = { ok: true; create: boolean } | { ok: false; reason: string };

/**
 * Whether `dir` may receive the starter. A missing directory is created; an
 * EMPTY one is used; anything else is refused, so the extraction can never
 * overwrite a file the user already has.
 */
export function judgeTargetDirectory(dir: string): TargetDirectoryVerdict {
  if (!existsSync(dir)) return { ok: true, create: true };
  if (!statSync(dir).isDirectory()) {
    return { ok: false, reason: `${dir} exists and is not a directory.` };
  }
  if (readdirSync(dir).length > 0) {
    return { ok: false, reason: `${dir} is not empty — refusing to extract over existing files.` };
  }
  return { ok: true, create: false };
}

export function isStarterVersionSpec(value: string): boolean {
  return STARTER_VERSION_SPEC.test(value);
}

/**
 * Unpacks the bundle into `dir` with the system `tar`. Entries live under
 * `package/`, like any npm tarball, so the first path component is stripped.
 */
function extractBundle(bytes: Buffer, dir: string): void {
  const scratch = mkdtempSync(join(tmpdir(), "nexus-app-starter-"));
  try {
    const archive = join(scratch, "bundle.tgz");
    writeFileSync(archive, bytes);
    execFileSync("tar", ["-xzf", archive, "-C", dir, "--strip-components=1"], {
      stdio: ["ignore", "ignore", "pipe"]
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

interface StarterResult {
  directory: string;
  starterVersion: string | null;
  uiVersion: string | null;
  bytes: number;
}

function printStarterResult(result: StarterResult, displayDir: string): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `${color.green("✓")} App starter ${result.starterVersion ?? "?"} ` +
      `(apps-ui ${result.uiVersion ?? "?"}, vendored) extracted to ${result.directory}`
  );
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${displayDir} && npm install`);
  console.log("");
  console.log(
    color.dim(
      "No npm token is needed: @agent-nexus/apps-ui is installed from vendor/, not the registry. " +
        "Commit package-lock.json after the install — the Dockerfile's npm ci reads it."
    )
  );
}

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
    .addHelpText(
      "after",
      `
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
`
    )
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
