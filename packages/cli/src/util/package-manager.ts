import fs from "node:fs";

export type PackageManager = "npm" | "pnpm" | "yarn";

/**
 * Which manager owns the copy of this CLI that is running.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 GUESSING WRONG HERE IS SILENT, AND IT LOOKS EXACTLY LIKE THE BUG `nexus
 *    upgrade` NOW VERIFIES AGAINST.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A wrong answer sends the install to a DIFFERENT manager's global prefix. That
 * install then succeeds — the package is real, the directory is writable, the
 * exit code is 0 — and the shell carries on resolving the shim the original
 * manager wrote. There is no error anywhere.
 *
 * ── WHY BOTH PATHS ARE READ, AND NOT JUST THE REAL ONE ──────────────────────
 *
 * This used to test `realpathSync(argv[1])` alone, and `realpath` DESTROYS the
 * evidence that identifies yarn. Measured on a developer machine, yarn 1.22.22:
 *
 *     yarn global bin  ->  ~/.yarn/bin          (the shim — matches /.yarn/)
 *     yarn global dir  ->  ~/.config/yarn/global (the store — does NOT)
 *
 * `~/.yarn/bin/nexus` is a symlink into the store, so resolving it yields
 * `~/.config/yarn/global/node_modules/@agent-nexus/cli/dist/index.js` — no
 * `/.yarn/` anywhere in it. Every yarn-global install therefore fell through to
 * `npm install -g`, wrote into npm's prefix, and left the yarn shim in place.
 *
 * So both spellings are tested: the LINK names the manager's bin directory, the
 * TARGET names its store, and either one is enough. The store patterns are
 * listed for the same reason — `/.config/yarn/` is not `/.yarn/` and never was.
 */
const MANAGER_PATTERNS: ReadonlyArray<readonly [PackageManager, RegExp]> = [
  // pnpm: `~/Library/pnpm/...`, `~/.local/share/pnpm/...`, and the `.pnpm`
  // content-addressed store inside any of them.
  ["pnpm", /[/]\.?pnpm[/]/],
  // yarn: the `.yarn/bin` shim, and the `.config/yarn/global` store it points
  // into. `/yarn/global/` also catches a `YARN_GLOBAL_FOLDER` moved elsewhere.
  ["yarn", /[/]\.yarn[/]|[/]\.config[/]yarn[/]|[/]yarn[/]global[/]/]
];

/**
 * Detect which package manager was used to install the CLI globally
 * by inspecting the path of the running binary — both as invoked and resolved.
 *
 * Defaults to npm, which is right for npm itself and is the only safe guess for
 * an unrecognised layout. `nexus upgrade` no longer trusts that guess: it reads
 * the PATH back after installing and reports a mismatch instead of a success.
 */
export function detectPackageManager(): PackageManager {
  const invoked = process.argv[1] ?? "";

  let resolved = "";
  try {
    resolved = invoked.length > 0 ? fs.realpathSync(invoked) : "";
  } catch {
    // The binary moved or is unreadable — the invoked path still carries the
    // manager's bin directory, which is the more identifying half anyway.
  }

  const haystack = `${invoked}\n${resolved}`.replace(/\\/g, "/");

  for (const [manager, pattern] of MANAGER_PATTERNS) {
    if (pattern.test(haystack)) return manager;
  }

  return "npm";
}

export function getGlobalInstallCommand(pkg: string, tag = "latest"): string {
  const pm = detectPackageManager();
  switch (pm) {
    case "pnpm":
      return `pnpm add -g ${pkg}@${tag}`;
    case "yarn":
      return `yarn global add ${pkg}@${tag}`;
    default:
      return `npm install -g ${pkg}@${tag}`;
  }
}

export function getGlobalUpdateHint(pkg: string): string {
  const pm = detectPackageManager();
  switch (pm) {
    case "pnpm":
      return `pnpm update -g ${pkg}`;
    case "yarn":
      return `yarn global upgrade ${pkg}`;
    default:
      return `npm update -g ${pkg}`;
  }
}
