import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import { describe, expect, it } from "vitest";

/**
 * NEX-3708: the CLI self-corrupted mid-session. `pnpm add -g` writes a NEW
 * hash directory under `<pnpm home>/global/v11/` and relinks the global shim;
 * the CLI runs that install from inside the directory being replaced, through
 * `execSync` with a 60 s SIGTERM ceiling. An install interrupted at that
 * ceiling leaves the shim resolving to a directory that no longer exists, and
 * then `nexus` throws `MODULE_NOT_FOUND` on `dist/index.js` for every
 * subsequent invocation until the user reinstalls by hand.
 *
 * Nothing in this package can repair that, and no test can cover the repair,
 * because the failure is in Node's module resolution — it happens before the
 * first line of this code runs. `--no-auto-update` cannot help either, which
 * is the reporter's own complaint. So the only fix available from inside the
 * CLI is not to take the risk unasked: **the updater is opt-in.**
 *
 * The mechanism is subtle enough to regress silently. Commander gives a LONE
 * `--no-x` an implicit default of `true`; declaring the positive `--x` beside
 * it removes that default. So deleting the `--auto-update` line — which reads
 * like tidying a redundant flag — turns the updater back on for everyone.
 *
 * These cases derive the option declarations from `index.ts` itself and assert
 * the RESULTING VALUE, so the guarantee is about behaviour rather than about
 * the presence of a line.
 */

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const INDEX = readFileSync(join(SRC_DIR, "index.ts"), "utf8");

/** Every `--…auto-update…` flag string `index.ts` declares, in order. */
function declaredAutoUpdateFlags(): string[] {
  const flags: string[] = [];
  const option = /\.option\(\s*"(--[^"]*auto-update[^"]*)"/g;
  let match = option.exec(INDEX);
  while (match !== null) {
    if (match[1] !== undefined) flags.push(match[1]);
    match = option.exec(INDEX);
  }
  return flags;
}

/** A program carrying exactly the flags `index.ts` declares, nothing else. */
function resolveAutoUpdate(argv: string[]): unknown {
  const program = new Command();
  program.name("nexus").exitOverride();
  for (const flag of declaredAutoUpdateFlags()) program.option(flag, "");
  program.parse(["node", "nexus", ...argv]);
  return program.opts().autoUpdate;
}

/** `index.ts` gates the install on this exact expression. */
function wouldSelfInstall(argv: string[]): boolean {
  return Boolean(resolveAutoUpdate(argv));
}

describe("the CLI never installs over itself unless asked", () => {
  it("declares BOTH flags — the positive one is what removes commander's implicit true", () => {
    // Anti-vacuity: with an empty or single-flag set the assertions below can
    // pass for the wrong reason, and a broken regex looks exactly like a file
    // that stopped declaring anything.
    expect(declaredAutoUpdateFlags().sort()).toEqual(["--auto-update", "--no-auto-update"]);
  });

  it("does NOT self-install by default", () => {
    expect(wouldSelfInstall([])).toBe(false);
  });

  it("self-installs only when --auto-update is passed", () => {
    expect(wouldSelfInstall(["--auto-update"])).toBe(true);
  });

  it("still honours --no-auto-update, so a script that passes it keeps working", () => {
    expect(wouldSelfInstall(["--no-auto-update"])).toBe(false);
  });

  it("lets the explicit flag win in either order", () => {
    expect(wouldSelfInstall(["--auto-update", "--no-auto-update"])).toBe(false);
    expect(wouldSelfInstall(["--no-auto-update", "--auto-update"])).toBe(true);
  });
});

describe("the help text does not promise a repair the CLI cannot perform", () => {
  it("says the updater is off by default", () => {
    expect(INDEX).toMatch(/--auto-update\s+self-update on exit; OFF by default/);
  });

  it("says plainly that no command runs once the install is broken", () => {
    // The reporter's complaint was that --no-auto-update did not repair an
    // existing break. It cannot, and the help now says so instead of implying
    // otherwise by silence.
    expect(INDEX).toMatch(/NO nexus command runs/);
    expect(INDEX).toMatch(/Reinstalling is the only repair/);
  });
});
