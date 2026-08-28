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

/**
 * The one command that moves a global install onto `@tag`, for every manager.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THERE IS NO SECOND BUILDER HERE, AND THAT IS THE POINT. AN `update` VERB
 *    CANNOT CROSS A 0.x MINOR, AND IT REPORTS SUCCESS WHEN IT DOES NOT MOVE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This file used to carry a second function that built the string the update
 * NAG printed, spelled with each manager's `update`/`upgrade` verb. The two were
 * introduced by one commit (c592c54154) and disagreed from that commit on: the
 * nag never named the command `nexus upgrade` runs. Those verbs
 * resolve within the range a global root already recorded, and npm/pnpm/yarn all
 * record `^0.x.y` — a caret on a `0.` major, which by semver does not admit the
 * next minor. So the nag told users to run a command that stops one minor short
 * of the version the same nag had just told them existed, exits 0, and prints a
 * line that reads like it worked. The banner then reappears forever.
 *
 * Measured against the live registry, from 0.34.x with `^0.34.0` recorded, at a
 * time when `latest` was 0.35.1 — each manager's own verb, then this command as
 * the control:
 *
 *     npm update  @agent-nexus/cli   -> 0.34.2, exit 0   (control -> 0.35.1)
 *     pnpm update @agent-nexus/cli   -> 0.34.2, exit 0   (control -> 0.35.1)
 *     yarn upgrade @agent-nexus/cli  -> 0.34.2, exit 0   (control -> 0.35.1)
 *
 * A tag is an exact resolution, so it is not subject to a recorded range at all
 * and is the only spelling that is right for every manager and every layout.
 * `nexus upgrade` has always run this; the nag is what disagreed with it.
 *
 * Every caller that tells a user how to move versions calls THIS. Do not add a
 * variant — a second string is what drifted, and it drifted inside one file.
 */
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
