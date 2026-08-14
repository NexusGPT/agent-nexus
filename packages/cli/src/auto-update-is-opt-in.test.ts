import { existsSync, readFileSync } from "node:fs";
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

/**
 * THE HELP TEXT WAS CORRECTED AND THE DOCS SITE WAS NOT.
 *
 * NEX-3708 flipped the default and updated `index.ts`. Five authored pages under
 * `content/docs/cli/` went on telling readers the opposite — "By default … it
 * **upgrades itself automatically**", "by default, auto-updates when one is
 * found", "let the next command auto-update" — for the whole of that time. The
 * pages are hand-written, so no projection could correct them, and nothing read
 * them.
 *
 * This is a NEGATIVE assertion because the positive one is unwritable: the true
 * statement has too many correct spellings to pin, while the false one has a
 * small stable vocabulary. It is deliberately narrow — it refuses "automatic by
 * default" and nothing else, so a page is free to describe the behaviour in
 * whatever words suit it.
 */
describe("no authored page says self-update is on by default", () => {
  const DOCS = join(SRC_DIR, "../../../content/docs/cli");

  /** The pages a human writes; the rest under `commands/` are projections. */
  const AUTHORED = [
    "index",
    "installation",
    "configuration",
    "output-and-input",
    "recipes",
    "troubleshooting",
    "authentication",
    "global-options"
  ];

  /**
   * Each entry is a pattern PLUS a sentence it must refuse. The sentence is not
   * decoration: it is asserted below, so a pattern that stops matching its own
   * origin fails rather than quietly passing over the text it was written for.
   *
   * Three of the four sentences are VERBATIM off the pages that shipped them —
   * `installation.mdx`, `global-options.mdx` and `installation.mdx`'s
   * troubleshooting table. The second is the same claim with the clauses
   * swapped; no page wrote it that way, and it is here because the order is
   * arbitrary and the next author has no reason to pick the one that shipped.
   *
   * `[^.\n]` bounds every gap to one sentence. Widening it to `[\s\S]` makes the
   * rule fire on a page that correctly says "off by default" a paragraph away
   * from the word `--auto-update`, which is most of the corrected text.
   */
  const FORBIDDEN: readonly { readonly pattern: RegExp; readonly shipped: string }[] = [
    {
      pattern: /by default[^.\n]{0,80}(upgrades itself|updates itself|auto-updates)/i,
      shipped:
        "By default, when the CLI detects a newer published version it **upgrades itself automatically**"
    },
    {
      pattern: /(upgrades itself|updates itself|auto-updates)[^.\n]{0,80}by default/i,
      // Not a sentence any page wrote — the mirrored order, see the note above.
      shipped: "the CLI auto-updates by default"
    },
    {
      pattern: /auto-update is (on|enabled)/i,
      shipped: "By default, auto-update is on."
    },
    {
      pattern: /let the next command auto-update/i,
      shipped: "Run `nexus upgrade`, or let the next command auto-update."
    }
  ];

  /** Text a corrected page is free to contain. Asserted clean below. */
  const PERMITTED = [
    "Self-update is off by default; pass --auto-update.",
    "`--auto-update` — self-update on exit. **Off by default** — see below.",
    "The CLI does not install over itself unless you ask it to."
  ];

  it("finds the authored pages it is supposed to read", () => {
    // Anti-vacuity: a moved docs tree would make the case below pass by reading
    // nothing, which is indistinguishable from reading eight clean pages.
    const missing = AUTHORED.filter((name) => !existsSync(join(DOCS, `${name}.mdx`)));
    expect(missing).toEqual([]);
  });

  it("refuses the sentence that was wrong on five pages", () => {
    const offenders: string[] = [];
    for (const name of AUTHORED) {
      const source = readFileSync(join(DOCS, `${name}.mdx`), "utf8");
      for (const { pattern, shipped } of FORBIDDEN) {
        if (pattern.test(source)) {
          offenders.push(`${name}.mdx says self-update is on by default (cf. "${shipped}")`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every pattern still matches the sentence it was written to refuse", () => {
    const dead = FORBIDDEN.filter(({ pattern, shipped }) => !pattern.test(shipped)).map(
      ({ shipped }) => `no pattern matches "${shipped}"`
    );
    expect(dead).toEqual([]);
  });

  it("and none of them fires on a correct sentence", () => {
    const overreach: string[] = [];
    for (const text of PERMITTED) {
      for (const { pattern } of FORBIDDEN) {
        if (pattern.test(text)) overreach.push(`${pattern} rejects "${text}"`);
      }
    }
    expect(overreach).toEqual([]);
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
