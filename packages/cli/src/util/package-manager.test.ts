import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectPackageManager, getGlobalInstallCommand } from "./package-manager";

/**
 * Which manager owns the running CLI, inferred from where it lives.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A WRONG ANSWER HERE IS THE SAME SYMPTOM `nexus upgrade` WAS FIXED FOR, AND
 *    IT IS EQUALLY SILENT: THE INSTALL SUCCEEDS INTO THE WRONG PREFIX.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `detectPackageManager` reads `process.argv[1]`, so every case here sets it and
 * builds the real directory layout on disk — the yarn case in particular only
 * reproduces through an actual symlink, because the bug was `realpathSync`
 * resolving the identifying path segment away.
 *
 * Measured on a developer machine, yarn 1.22.22:
 *   yarn global bin -> ~/.yarn/bin           (the shim)
 *   yarn global dir -> ~/.config/yarn/global (what the shim points at)
 */

let root: string;
let originalArgv1: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "package-manager-"));
  originalArgv1 = process.argv[1];
});

afterEach(() => {
  process.argv[1] = originalArgv1;
  rmSync(root, { recursive: true, force: true });
});

/** Build a real file at `relative` under the temp root and point argv[1] at it. */
function runningFrom(relative: string): string {
  const target = join(root, relative);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, "// dist\n");
  process.argv[1] = target;
  return target;
}

/** A `bin` shim symlinked at `link` pointing to a real entry point at `store`. */
function shimPointingAt(link: string, store: string): void {
  const target = runningFrom(store);
  const shim = join(root, link);
  mkdirSync(join(shim, ".."), { recursive: true });
  symlinkSync(target, shim);
  process.argv[1] = shim;
}

describe("detectPackageManager", () => {
  it("detects pnpm from its global store", () => {
    runningFrom("Library/pnpm/global/v11/node_modules/@agent-nexus/cli/dist/index.js");
    expect(detectPackageManager()).toBe("pnpm");
  });

  it("detects pnpm from the content-addressed .pnpm directory", () => {
    runningFrom(
      "Library/pnpm/global/v11/.pnpm/@agent-nexus+cli@0.25.0/node_modules/@agent-nexus/cli/dist/index.js"
    );
    expect(detectPackageManager()).toBe("pnpm");
  });

  it("detects yarn classic THROUGH its shim, whose realpath drops the .yarn segment", () => {
    // THE RED. Before the fix this returned "npm": `realpathSync` turns
    // `~/.yarn/bin/nexus` into `~/.config/yarn/global/node_modules/...`, which
    // contains no `/.yarn/` for the old single regex to match. Every
    // yarn-global user was handed `npm install -g` — an install that succeeds,
    // writes into npm's prefix, and leaves the yarn shim resolving the old CLI.
    shimPointingAt(
      ".yarn/bin/nexus",
      ".config/yarn/global/node_modules/@agent-nexus/cli/dist/index.js"
    );

    expect(detectPackageManager()).toBe("yarn");
    expect(getGlobalInstallCommand("@agent-nexus/cli")).toBe(
      "yarn global add @agent-nexus/cli@latest"
    );
  });

  it("detects yarn classic from the store path alone", () => {
    runningFrom(".config/yarn/global/node_modules/@agent-nexus/cli/dist/index.js");
    expect(detectPackageManager()).toBe("yarn");
  });

  it("falls back to npm for an npm prefix", () => {
    runningFrom(".nvm/versions/node/v24.9.0/lib/node_modules/@agent-nexus/cli/dist/index.js");
    expect(detectPackageManager()).toBe("npm");
  });

  it("falls back to npm rather than throwing when argv[1] does not exist", () => {
    // `realpathSync` throws on a deleted binary. The invoked path is still
    // readable and still carries the manager's bin directory.
    process.argv[1] = join(root, "deleted/lib/node_modules/@agent-nexus/cli/dist/index.js");
    expect(detectPackageManager()).toBe("npm");
  });

  it("still reads the manager off a DELETED pnpm shim", () => {
    // The exact shape of a shim left pointing into a collected pnpm directory:
    // nothing to resolve, and the invoked path names pnpm anyway.
    process.argv[1] = join(root, "Library/pnpm/global/v11/85d5-gone/node_modules/x/dist/index.js");
    expect(detectPackageManager()).toBe("pnpm");
  });
});
