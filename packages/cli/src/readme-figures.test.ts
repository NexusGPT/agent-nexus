import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { beforeAll, describe, expect, it } from "vitest";

import { deriveCommandLeaves, isHiddenCommand } from "./command-universe";
import { buildRootProgram, VERSION } from "./root-program";

/**
 * EVERY NUMBER `README.md` ASSERTS ABOUT THIS PACKAGE, DERIVED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `compatibility-figures.test.ts` pins every figure in `COMPATIBILITY.md`, and
 * its own header names the hole it leaves: *"It cannot notice a claim nobody
 * pinned."* `README.md` was that claim. It advertised **49 command groups, 519
 * invocable subcommands** against a live tree of **52** and **546** — stale by 3
 * and 27, with nothing anywhere reading the file.
 *
 * 🔴 **This is the most expensive place in the package for a number to rot, and
 * it was the only unguarded one.** `README.md` is the npm listing: it is the
 * first thing a prospective user reads, it renders on the package page, and it
 * ships inside the published tarball. `COMPATIBILITY.md` — the file that DID
 * have a gate — is read by people who already installed the CLI.
 *
 * ── WHY A SEPARATE FILE RATHER THAN A ROW OVER THERE ─────────────────────────
 *
 * Two documents make two claims about two populations and can go stale
 * independently, so they get two gates: this one fails naming `README.md`, and
 * a rewording here cannot silence a `COMPATIBILITY.md` row or vice versa. The
 * mechanism is deliberately the same one, because it is the mechanism that
 * worked — every figure it pins was correct at the sha this file landed on,
 * while all four unpinned ones nearby were not.
 *
 * ── HOW A CLAIM IS PINNED ────────────────────────────────────────────────────
 *
 * A REGEX with capture groups, plus the derivation those captures must equal.
 * The regex anchors a number to its SENTENCE — asserting the file "contains 52"
 * would pass on any 52 anywhere, including a version string or a byte count.
 *
 * 🚨 A REGEX THAT STOPS MATCHING IS A FAILURE, NEVER A SKIP. Reword the bullet
 * and its numbers go unchecked forever, silently, which is the same rot in a new
 * place. {@link CLAIMS} is driven through `eachOrRefuse` — vitest registers ZERO
 * tests and exits 0 on an empty `.each` table, so an empty table would report
 * PASSED — and every row asserts it matched EXACTLY ONCE.
 *
 * ── WHAT THIS CANNOT DO ──────────────────────────────────────────────────────
 *
 *  - It checks NUMBERS, not prose. "Zero config after `nexus auth login`" is
 *    unpinned and unpinnable here; if that command is renamed this stays green.
 *  - It cannot notice a claim nobody pinned — the same hole, one level down. A
 *    new bullet quoting a new figure is unprotected until someone adds a row.
 *  - It says nothing about whether the two words mean what a reader thinks.
 *    "command groups" is pinned to the top-level command count and "invocable
 *    subcommands" to the invocable-leaf count; that mapping is a judgement this
 *    file records and cannot itself verify.
 */

const DOC = join(dirname(fileURLToPath(import.meta.url)), "..", "README.md");

/** The file as one line, so a wrapped sentence is matchable. */
let doc = "";

/** Everything derived off the live command tree, once. */
let derived: Record<string, number> = {};

beforeAll(async () => {
  doc = readFileSync(DOC, "utf-8").replace(/\s+/g, " ");

  const root = buildRootProgram(VERSION);
  // `help` is commander's own built-in and is not a command this package ships.
  const tops = root.commands.filter((command) => command.name() !== "help");
  const leaves = await deriveCommandLeaves();

  derived = {
    // `isHiddenCommand`, never a `_hidden` read — that field is private and
    // undeclared, so a rename upstream yields `undefined`, `undefined === true`
    // is false, and every hidden command would report itself VISIBLE with no
    // compiler error. It asks commander's own help filter what it would render.
    commandGroups: tops.filter((command) => !isHiddenCommand(command)).length,
    invocableSubcommands: leaves.length
  };
}, 120_000);

interface Claim {
  /** What the sentence says, for the failure message. */
  readonly claim: string;
  /** Anchored to its sentence. Every capture group is a number to check. */
  readonly pattern: RegExp;
  /** The derivation keys, in capture-group order. */
  readonly keys: readonly string[];
}

const CLAIMS: readonly Claim[] = [
  {
    claim: "N command groups, M invocable subcommands",
    pattern: /- (\d+) command groups, (\d+) invocable subcommands/,
    keys: ["commandGroups", "invocableSubcommands"]
  }
];

describe("the README's figures rest on a real reading", () => {
  it("read the document at all", () => {
    // An unreadable or empty file makes every row below fail for the wrong
    // reason, and a path that silently resolved to nothing is the likeliest way
    // that happens.
    expect(doc.length).toBeGreaterThan(500);
    expect(doc).toContain("@agent-nexus/cli");
  });

  it("VACUITY: every derivation returned a real population", () => {
    // A derivation returning 0 would compare equal to nothing and red for the
    // wrong reason — or, worse, agree with a document that also said 0.
    const empty = Object.entries(derived)
      .filter(([, value]) => !Number.isInteger(value) || value <= 0)
      .map(([key]) => key);

    expect(
      empty,
      "a derivation returned nothing usable. The command tree failed to build, " +
        "or a walk stopped returning rows — fix that before reading any assertion below."
    ).toEqual([]);
  });

  it("NEGATIVE CONTROL: a pattern that should not match does not", () => {
    // Proves a non-match is DETECTABLE. Every row's matched-exactly-once
    // assertion rests on this, and a regex engine that matched everything would
    // make the whole file vacuous while reading green.
    expect(/- (\d+) command penguins, (\d+) invocable marsupials/.test(doc)).toBe(false);
  });

  it("POSITIVE CONTROL: the pattern shape does find a sentence that IS there", () => {
    // The twin the negative control cannot supply. A pattern broken by a typo
    // matches nothing, and "matched nothing" is indistinguishable from "the
    // claim is absent" — so a bare negative control proves the probe works only
    // against text, never against THIS text.
    expect(/- (\d+) command groups/.test(doc)).toBe(true);
  });
});

describe("every figure README.md asserts is the derived one", () => {
  it.each(eachOrRefuse(CLAIMS, "pinned README.md figures"))(
    "$claim",
    ({ claim, pattern, keys }) => {
      const matches = [...doc.matchAll(new RegExp(pattern, "g"))];

      expect(
        matches.length,
        `NO SENTENCE MATCHED for "${claim}".\n` +
          `Pattern: ${pattern}\n` +
          `The bullet was reworded, moved or deleted. A number nobody matches is a ` +
          `number nobody checks, which is exactly how this file went wrong — so this ` +
          `is a failure, never a skip. Re-anchor the pattern to the new wording, or ` +
          `delete this row if the claim is genuinely gone.`
      ).toBe(1);

      const found = matches[0].slice(1, keys.length + 1).map(Number);
      const want = keys.map((key) => derived[key]);

      expect(
        found,
        `README.md says ${JSON.stringify(found)} where this package derives ` +
          `${JSON.stringify(want)} (${keys.join(", ")}).\n` +
          `The DOCUMENT is what is stale — the derivation reads the live command tree. ` +
          `Update the bullet for "${claim}". README.md ships to npm and is the package ` +
          `page, so a wrong figure here is the first thing a prospective user reads.`
      ).toEqual(want);
    }
  );
});
