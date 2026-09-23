import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { NPM_LOCKFILE_NAMES, VENDOR_DIRECTORY } from "@nexus/vibe-app-vendoring";

import type { AppFiles } from "./vendor-plan";

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
