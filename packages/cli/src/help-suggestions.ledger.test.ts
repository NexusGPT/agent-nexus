import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUDIT_TOTAL,
  DEFECTIVE_COUNT,
  HELP_SUGGESTIONS,
  type HelpSuggestion,
  PLACED_COUNT,
  REVIEWED_NAMESPACES
} from "./commands/help-suggestions.ledger";
import { buildRootProgram } from "./root-program";

/**
 * THE GATE UNDER `help-suggestions.ledger.ts`.
 *
 * The ledger's whole claim is that "N of 237 placed" is a property of the tree.
 * That claim is only worth anything if a placement can FAIL here — so every
 * `placed` row is re-read out of the real `--help` output of its leaf, on the
 * real root program, on every run.
 *
 * ── WHY THE REAL ROOT AND NOT A REBUILT PROGRAM ─────────────────────────────
 *
 * `buildRootProgram()` returns the object `index.ts` runs. A test that builds
 * its own `new Command()` and hangs one registrar off it is testing a program
 * no user ever sees: the root installs help decorations AFTER every registrar
 * has run, so a throwaway carries none of them and a probe aimed at one would
 * be permanently red for a reason that is not about the placement.
 *
 * `outputHelp()`, never `helpInformation()` — only the former runs the
 * `addHelpText` handlers, and every placement in this ledger IS one. A probe
 * built on `helpInformation()` would pass against a program that registered
 * nothing.
 */

const VERSION = "1.2.3";

/** The bytes a caller reads from `--help`. */
function helpText(command: Command): string {
  let captured = "";
  command.configureOutput({
    writeOut: (str: string) => {
      captured += str;
    },
    writeErr: (str: string) => {
      captured += str;
    }
  });
  command.outputHelp();
  return captured;
}

/**
 * The `leaf` spelling that means THE ROOT PROGRAM ITSELF.
 *
 * 🚨 WITHOUT THIS, A NOTE IN THE ROOT EPILOGUE COULD NOT BE RECORDED AT ALL.
 * `resolve()` ended with `cursor === root ? null : cursor`, so every spelling of
 * the root reported "no such command path" — and four rows in this ledger are
 * answered ONLY by the epilogue `index.ts` hangs off the root, one of them
 * carrying the literal word "top-level" as its target. The ledger's own rule is
 * that a fact holding for more than one command lives in the root epilogue, so
 * this was not an edge case: it was a whole category the gate refused.
 *
 * ── WHY `"nexus"` AND NOT `""` ──────────────────────────────────────────────
 *
 * `""` would need no code at all — it walks zero segments and lands on the root
 * on its own — and that is exactly the objection. An EMPTY `leaf` is what a row
 * someone forgot to fill in looks like, and the guard below is the only thing
 * that catches one. Spending it on the sentinel would trade a named "no such
 * command path" for a mystifying "probe absent" against a leaf nobody chose.
 *
 * The word is also the vocabulary this ledger already uses: these rows carry
 * `target: "nexus --help"`, and `leaf: "nexus"` is the command a reader runs to
 * see the text the probe is checked against.
 */
const ROOT_LEAF = "nexus";

/**
 * Resolve a space-separated command path against the root, or `null`.
 *
 * Returns `null` rather than throwing so a wrong `leaf` is reported as a NAMED
 * row alongside every other failure, instead of aborting the case on the first
 * one and hiding the rest.
 */
function resolve(root: Command, leaf: string): Command | null {
  if (leaf === ROOT_LEAF) return root;

  let cursor: Command = root;
  for (const segment of leaf.split(/\s+/).filter(Boolean)) {
    const next = cursor.commands.find(
      (child) => child.name() === segment || child.aliases().includes(segment)
    );
    if (next === undefined) return null;
    cursor = next;
  }
  return cursor === root ? null : cursor;
}

/**
 * Point the version cache at an empty directory.
 *
 * The scope footer reads `~/.nexus-mcp/version-check.json` while it renders, so
 * without this the captured help is a function of the machine and the day. A
 * probe would then pass or fail on whether someone had recently run the CLI.
 */
function withEmptyVersionCache(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-help-suggestions-"));
  vi.spyOn(os, "homedir").mockReturnValue(dir);
}

afterEach(() => {
  vi.restoreAllMocks();
});

const placed = HELP_SUGGESTIONS.filter((s) => s.state === "placed");
const blocked = HELP_SUGGESTIONS.filter((s) => s.state === "blocked");
const open = HELP_SUGGESTIONS.filter((s) => s.state === "open");
const obsolete = HELP_SUGGESTIONS.filter((s) => s.state === "obsolete");
const defective = HELP_SUGGESTIONS.filter((s) => s.defect !== undefined);

/**
 * The identifier grammar for `defect`. Whole string, so `NEX-3853 (jq aborts)`
 * is refused — the field is a POINTER, and the moment it can carry a sentence it
 * becomes the free-text excuse the ledger already has a `reason` for.
 */
const DEFECT_TICKET = /^NEX-\d+$/;

describe("the authored-suggestion ledger describes the tree it ships with", () => {
  /**
   * The denominator. `AUDIT_TOTAL` is the audit's own total and it is a CEILING:
   * a new idea about `--help` is a new ticket, never a 238th row, because the
   * moment the table grows past it "N of 237" stops meaning what the audit
   * measured. `help-suggestions.ledger.ts` holds the argument for why the other
   * direction is deliberately left open.
   */
  it("holds the audit in full, once each", () => {
    expect(
      HELP_SUGGESTIONS.length,
      `the audit holds ${HELP_SUGGESTIONS.length} rows against a total of ${AUDIT_TOTAL}. ` +
        `This can only fail by GROWING — a 238th row is a new ticket, not a row here.`
    ).toBeLessThanOrEqual(AUDIT_TOTAL);

    const ids = HELP_SUGGESTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Every row is accounted for by exactly one of the four states. This sum is
    // what catches a state added to the union and forgotten here — the rows in
    // it would vanish from every count without any assertion going red.
    //
    // 🚨 AGAINST THE TABLE'S OWN LENGTH, never against a literal. A literal here
    // is the same equality the line above stopped being, and it says nothing the
    // partition needs: the claim is that the four states cover the table, which
    // is true of a table of 237 and of a table of 12.
    expect(placed.length + blocked.length + open.length + obsolete.length).toBe(
      HELP_SUGGESTIONS.length
    );
  });

  it("gives every row a target and a summary a reader can act on", () => {
    const empty = HELP_SUGGESTIONS.filter(
      (s) => s.target.trim() === "" || s.summary.trim() === ""
    ).map((s) => s.id);

    expect(empty).toEqual([]);
  });

  /**
   * The shape rules. A `placed` row without a probe is a claim with nothing
   * behind it — the exact failure this ledger replaced — so it is refused at
   * the schema level rather than silently skipped by the probe case below.
   */
  it("refuses a placement that cannot be checked, and a block with no reason", () => {
    const unprovable = placed
      .filter((s) => s.leaf === undefined || s.probe === undefined || s.probe.trim() === "")
      .map((s) => s.id);
    expect(unprovable).toEqual([]);

    // `blocked` and `obsolete` are both judgements, and a judgement with no
    // stated ground cannot be disagreed with — only re-derived.
    const unexplained = [...blocked, ...obsolete]
      .filter((s) => s.reason === undefined || s.reason.trim() === "")
      .map((s) => s.id);
    expect(unexplained).toEqual([]);

    // An `obsolete` row describes a defect that is GONE, so there is no line in
    // the tree and nothing to probe. A probe on one would be checked against a
    // note nobody wrote.
    const obsoleteWithEvidence = obsolete
      .filter((s) => s.probe !== undefined || s.leaf !== undefined)
      .map((s) => s.id);
    expect(obsoleteWithEvidence).toEqual([]);

    // An `open` row carries no evidence fields — it is the backlog, and a probe
    // sitting on one reads as placed to anyone grepping the file.
    const overclaiming = open
      .filter((s) => s.probe !== undefined || s.leaf !== undefined)
      .map((s) => s.id);
    expect(overclaiming).toEqual([]);
  });

  /**
   * THE CASE THIS FILE EXISTS FOR.
   *
   * Reword a placed note, delete it, or move it to another leaf, and the id
   * shows up here. Nothing else on the machine notices.
   */
  it("finds every placed suggestion in the real --help of its leaf", () => {
    withEmptyVersionCache();
    const root = buildRootProgram(VERSION);

    const failures: string[] = [];
    for (const suggestion of placed) {
      const leaf = suggestion.leaf as string;
      const command = resolve(root, leaf);
      if (command === null) {
        failures.push(`${suggestion.id}: no such command path "${leaf}"`);
        continue;
      }
      if (!helpText(command).includes(suggestion.probe as string)) {
        failures.push(
          `${suggestion.id}: "${suggestion.probe}" is absent from "nexus ${leaf} --help"`
        );
      }
    }

    expect(failures).toEqual([]);
  });

  /**
   * ANTI-VACUITY, AND THE NUMERATOR ITSELF.
   *
   * Every assertion above is satisfied by a ledger in which nothing is placed:
   * an empty `placed` set makes the probe loop iterate zero times and read
   * green.
   *
   * 🚨 A FLOOR IS NOT ENOUGH, AND THIS CASE WAS ONE. `>= 1` against a ledger
   * holding scores of placements lets all but one flip back to `open` with the
   * suite still green — so the numerator of "N of 237", the whole subject of
   * this file, stayed unchecked by the very case written to check it.
   *
   * The count is EXACT and refused in BOTH directions, which is the idiom the
   * lint-debt and spec-double ledgers already use here. A placement that
   * disappears reds; so does one that lands without recording itself, because
   * `PLACED_COUNT` is then behind the tree and the figure quoted anywhere else
   * is wrong. Landing a placement is therefore two edits in one reviewed diff:
   * the row, and the number.
   */
  it("holds exactly the placements it declares, and says how many are defective", () => {
    // ONE assertion carrying BOTH figures, so a failure diff prints them
    // together. "110 placed" read on its own overstates by the defective count;
    // the two numbers answer different questions and are never netted.
    expect({ placed: placed.length, knownDefective: defective.length }).toEqual({
      placed: PLACED_COUNT,
      knownDefective: DEFECTIVE_COUNT
    });

    expect(PLACED_COUNT).toBeGreaterThanOrEqual(1);

    // The subset relation itself. Without this the two counts could describe
    // disjoint sets and both still be "right".
    expect(DEFECTIVE_COUNT).toBeLessThanOrEqual(PLACED_COUNT);
  });

  /**
   * THE FIELD THAT STOPS A BROKEN NOTE READING AS A CLEAN ONE.
   *
   * A `placed` row can be answered and WRONG at the same time — `channel-01`'s
   * note is in the tree and the `jq` recipe it publishes aborts. `defect` records
   * that without inventing a fifth state, which would force every count to
   * decide whether it sits in the numerator (see the ledger header; both answers
   * are wrong).
   *
   * 🚨 THE STATE RULE IS THE HALF THAT KEEPS THE COUNTS HONEST. A `defect` on an
   * `open` row would be counted as a known-defective note that nobody has
   * written, so `DEFECTIVE_COUNT` would stop being a subset of `PLACED_COUNT`
   * and "110 placed, 1 defective" would describe two disjoint things.
   */
  it("allows a defect only on a placement, and only as a ticket identifier", () => {
    const misstated = HELP_SUGGESTIONS.filter(
      (s) => s.defect !== undefined && s.state !== "placed"
    ).map((s) => `${s.id}: defect on a row in state "${s.state}"`);
    expect(misstated).toEqual([]);

    const malformed = defective
      .filter((s) => !DEFECT_TICKET.test(s.defect as string))
      .map((s) => `${s.id}: "${s.defect}" is not a NEX ticket`);
    expect(malformed).toEqual([]);
  });

  /**
   * THE GRAMMAR, FROM BOTH DIRECTIONS, PINNED AGAINST LITERALS.
   *
   * Deliberately not against the ledger's own rows: `DEFECTIVE_COUNT` is allowed
   * to reach 0 — every defective note fixed is the correct end state — and on
   * that day the case above iterates an empty set and proves nothing. This one
   * still fails if the pattern is loosened into accepting prose, or tightened
   * into rejecting the identifier it exists to accept.
   */
  it("tells a ticket identifier apart from a free-text excuse", () => {
    expect(DEFECT_TICKET.test("NEX-3853")).toBe(true);
    expect(DEFECT_TICKET.test("NEX-1")).toBe(true);

    expect(DEFECT_TICKET.test("NEX-3853 (the jq recipe aborts)")).toBe(false);
    expect(DEFECT_TICKET.test("the jq recipe aborts")).toBe(false);
    expect(DEFECT_TICKET.test("NEX-")).toBe(false);
    expect(DEFECT_TICKET.test("nex-3853")).toBe(false);
    expect(DEFECT_TICKET.test(" NEX-3853")).toBe(false);
    expect(DEFECT_TICKET.test("")).toBe(false);
  });

  /**
   * The probe mechanism proves itself here rather than being trusted.
   *
   * A probe that no help text contains must fail. Without this, a `resolve()`
   * that quietly returned the root, or a `helpText()` that captured nothing,
   * would make every probe "pass" against an empty string — and the case above
   * would be green while checking nothing at all.
   */
  it("a probe that is not in the help text is a failure, not a pass", () => {
    withEmptyVersionCache();
    const root = buildRootProgram(VERSION);
    const anyPlaced = placed[0] as HelpSuggestion;
    const command = resolve(root, anyPlaced.leaf as string);

    expect(command).not.toBeNull();
    const rendered = helpText(command as Command);

    // The control: the real probe is found in the text the negative uses.
    expect(rendered).toContain(anyPlaced.probe as string);
    expect(rendered).not.toContain("__A_STRING_NO_HELP_TEXT_CONTAINS__");
  });

  /**
   * THE ROOT SENTINEL, PINNED TO THE TEXT IT IS FOR.
   *
   * 🚨 "IT RESOLVES TO SOMETHING" IS NOT THE CLAIM. `resolve()` walking to the
   * wrong command still returns non-null, and a probe checked against the wrong
   * help is the precise failure this ledger exists to prevent — so a case
   * asserting only `not.toBeNull()` would leave the fix untestable and read
   * green over a sentinel that landed anywhere.
   *
   * The assertion is therefore that the rendered bytes are the ROOT EPILOGUE:
   * a line only `index.ts` writes, and one of the four probes actually placed
   * there. The negative control below is what makes that mean something —
   * `auth whoami` is a real leaf whose help must NOT carry the same line, so a
   * `resolve()` that returned an arbitrary command cannot satisfy both halves.
   */
  it("resolves the root sentinel to the root program, epilogue and all", () => {
    withEmptyVersionCache();
    const root = buildRootProgram(VERSION);

    expect(resolve(root, ROOT_LEAF)).toBe(root);

    const rootHelp = helpText(root);
    expect(rootHelp).toContain("Global flags work anywhere in the line");
    expect(rootHelp).toContain("FIVE COMMANDS SPELL THE BODY FLAG --data");

    // The control: that line is the root's and no leaf's.
    const leaf = resolve(root, "auth whoami");
    expect(leaf).not.toBeNull();
    expect(helpText(leaf as Command)).not.toContain("Global flags work anywhere in the line");

    // And an empty `leaf` stays a BROKEN PATH rather than becoming a second
    // spelling of the root — the guard the sentinel deliberately does not spend.
    expect(resolve(root, "")).toBeNull();
  });
});

/**
 * The namespace an id belongs to.
 *
 * 🚨 STRIP THE ORDINAL — never `startsWith(ns + "-")`. That spelling makes
 * `agent` swallow `agent-skill`, `agent-tool` and `agent-collection`, so
 * reviewing `agent` silently claimed sibling namespaces and rows nobody had
 * looked at. The first version of this file did exactly that and the case
 * below is what caught it.
 */
function namespaceOf(id: string): string {
  return id.replace(/-\d+$/, "");
}

describe("a reviewed namespace is reviewed in full", () => {
  /**
   * `REVIEWED_NAMESPACES` is the only thing that makes `open` readable, so it
   * cannot be a claim either. A namespace is listed as reviewed when every one
   * of its rows has been RESOLVED — placed against a real leaf, or blocked or
   * obsoleted with a reason. A row still sitting at `open` in a "reviewed" namespace means the
   * sweep did not finish, and that reads from the outside exactly like a
   * namespace that was swept and came back empty.
   */
  it("leaves no unresolved row inside a namespace it calls reviewed", () => {
    const reviewed = new Set(REVIEWED_NAMESPACES);
    const unresolved = HELP_SUGGESTIONS.filter(
      (s) => s.state === "open" && reviewed.has(namespaceOf(s.id))
    ).map((s) => s.id);

    expect(unresolved).toEqual([]);
  });

  it("names only namespaces that have rows", () => {
    const present = new Set(HELP_SUGGESTIONS.map((s) => namespaceOf(s.id)));
    const withoutRows = REVIEWED_NAMESPACES.filter((ns) => !present.has(ns));

    expect(withoutRows).toEqual([]);

    // 🚨 NO FLOOR ON `REVIEWED_NAMESPACES`, DELIBERATELY.
    //
    // `expect(REVIEWED_NAMESPACES.length).toBeGreaterThanOrEqual(1)` stood here
    // as this block's anti-vacuity control, and a floor on a hand-written list
    // refuses a correct edit: emptying it is what a re-audit does, and the person
    // doing one finds the suite red and deletes the case. A floor on the derived
    // namespace CENSUS is no better — it is built from the audit's own ids, so it
    // empties with the table and dies on the same day.
    //
    // The vacuity it was guarding is already covered by something that survives
    // every drain: `namespaceOf` is pinned against LITERALS below
    // ("does not let one namespace swallow a longer one"), which is the arm that
    // catches the ordinal-stripping breaking. With the splitter proven, both
    // assertions here are correctly vacuous over an empty reviewed list — there
    // is genuinely nothing claimed and nothing to check.
  });

  /**
   * The ordinal-stripping itself, pinned. `agent` and `agent-skill` are two
   * namespaces in this ledger and every id in both starts with `agent-`.
   */
  it("does not let one namespace swallow a longer one", () => {
    expect(namespaceOf("agent-01")).toBe("agent");
    expect(namespaceOf("agent-skill-04")).toBe("agent-skill");
    expect(namespaceOf("agent-skill-04")).not.toBe("agent");
  });
});

describe("the ledger stays a ledger", () => {
  const LEDGER_PATH = path.join(__dirname, "commands", "help-suggestions.ledger.ts");

  /**
   * `help-suggestions.ledger.ts` must pull in NO OTHER MODULE, for the reason
   * `contract-help.ledger.ts` gives: a ledger that names a command file drags
   * in that file's generated contract module, and `scripts/generated-drift.mjs`
   * runs the generators against a tree it has just WIPED. The ledger then fails
   * to LOAD, and the generator that was supposed to rewrite that tree never
   * runs.
   *
   * The TEXT is what is checked, not the module graph: an `import type` is
   * erased today and one refactor away from not being.
   *
   * 🚨 `import` IS NOT THE ONLY SPELLING. `export { X } from "./y"` and
   * `export * from "./y"` load the target exactly as an import does — this case
   * scanned for `import` alone and would have passed one straight through.
   * `import(...)` at expression position is caught too: it is lazier, but it
   * still names a module this file must not know about.
   *
   * ⚠️ THE DYNAMIC FORMS ARE ANCHORED ON THE OPENING QUOTE, DELIBERATELY. This
   * file is mostly PROSE stored as data, and `\bimport\s*\(` matched the audit's
   * own row `target: "cloud-import (all commands)"` — a false red on a string
   * that is not code at all. A module specifier is always a quoted literal, so
   * requiring the quote separates the two without inventing a parser.
   */
  const DYNAMIC_IMPORT = /\bimport\s*\(\s*["'`]/;
  const DYNAMIC_REQUIRE = /\brequire\s*\(\s*["'`]/;

  it("pulls in no other module, by any spelling", () => {
    const source = fs.readFileSync(LEDGER_PATH, "utf8");

    const offenders = source
      .split("\n")
      .filter(
        (line) =>
          /^\s*import\b/.test(line) ||
          /^\s*export\s+(\*|\{[^}]*\}|type\s)[^;]*\sfrom\s/.test(line) ||
          DYNAMIC_IMPORT.test(line) ||
          DYNAMIC_REQUIRE.test(line)
      );

    expect(offenders).toEqual([]);
  });

  /**
   * The detector, from both directions, so neither loosening nor tightening it
   * can go unnoticed. The prose cases are real rows out of this ledger.
   */
  it("tells a module specifier apart from prose that contains the word", () => {
    expect(DYNAMIC_IMPORT.test('const x = await import("./root-program");')).toBe(true);
    expect(DYNAMIC_REQUIRE.test('const x = require("./root-program");')).toBe(true);

    expect(DYNAMIC_IMPORT.test('    target: "cloud-import (all commands)",')).toBe(false);
    expect(DYNAMIC_IMPORT.test('    target: "cloud-import search / import (sharepoint)",')).toBe(
      false
    );
  });

  /**
   * THE CONTROL FOR THE CASE ABOVE.
   *
   * A read that returns nothing — a renamed ledger, a path assembled wrong, a
   * mocked `fs` from a neighbouring case — satisfies "no offending lines"
   * perfectly. Without this, the strongest form of that assertion and a
   * completely absent file are the same green.
   */
  it("actually read the ledger it just cleared", () => {
    const source = fs.readFileSync(LEDGER_PATH, "utf8");

    expect(source).toContain("export const HELP_SUGGESTIONS");
    expect(source).toContain("export const REVIEWED_NAMESPACES");
    expect(source.split("\n").length).toBeGreaterThan(HELP_SUGGESTIONS.length);

    // And the detector is not vacuous: it finds a real import when there is one.
    const planted = `import { x } from "./y";\n${source}`;
    expect(planted.split("\n").filter((l) => /^\s*import\b/.test(l))).toHaveLength(1);
  });
});
