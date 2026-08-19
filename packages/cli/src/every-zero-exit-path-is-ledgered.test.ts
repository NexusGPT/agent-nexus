import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { stripTsComments } from "./util/strip-ts-comments";

/**
 * EVERY `process.exit` IN THIS PACKAGE IS NAMED, BECAUSE A ZERO-EXIT PATH IS
 * WHERE `--json` GOES TO DIE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A LEDGER RATHER THAN A RULE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `json-terminal-contract.ts` owns commander's stdout door, so no path commander
 * itself takes can print prose under `--json`. That is a real construction and it
 * has one shape it cannot reach: **a call site that writes to `process.stdout`
 * directly and then exits.** Commander never sees those bytes, so nothing can
 * intercept them.
 *
 * One was live while the first version of that construction was being written,
 * and it was found by review rather than by any gate here:
 *
 *     nexus agent list --print-contract --json   ->  196 bytes of prose, exit 0
 *
 * `--print-contract` is declared on **177** commands, and its `option:` listener
 * wrote through `process.stdout.write` and called `process.exit(0)`. Every
 * driven gate in this package passed over it, because the flag is not in any
 * synthesized argv and the exit is not a refusal.
 *
 * So the population is the CALL SITES, and the obligation is that each is
 * written down with what it does about `--json`. A new one cannot be added in
 * silence: the scan turns red naming the file and line until somebody writes the
 * sentence. That is deliberately a ratchet and not a ban — `process.exit` is
 * correct in several of these, and a gate that forbade it would be turned off.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A RAW TEXT SCAN FOR `process.exit(` REDS ON ITS OWN DOCUMENTATION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Measured on this package: **11** raw matches, and **8** of them are PROSE —
 * docblocks in `errors.ts`, `help-scope.ts` and `known-issues-help.ts`
 * explaining what commander does. A gate that fails on the paragraph describing
 * it is the gate somebody loosens to unblock a build, and then it protects
 * nothing.
 *
 * String content is blanked too, because `json-one-document.scan.ts` builds the
 * message `` `process.exit(${code})` `` inside a template literal — a sentence,
 * not a call. `${…}` interpolations survive, since a call could legitimately live
 * inside one.
 *
 * {@link blankNonCode} does both in ONE offset-preserving pass, for a reason its
 * own docblock records: the shared {@link stripTsComments} deletes a block
 * comment newlines and all, so a scanner built on it reports the wrong LINE. The
 * two are held in agreement by a corpus-wide control below.
 *
 * Every arm of the detector is tested against fixtures before anything is
 * measured with it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Blank every non-code region — comment bodies AND string/template content —
 * keeping the total length, every newline, and every `${…}` interpolation.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 WHY THIS DOES ITS OWN COMMENT PASS INSTEAD OF USING `stripTsComments`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `stripTsComments` DELETES a block comment, newlines and all, which is right for
 * its other callers and wrong for a scanner that reports a LINE NUMBER. This gate
 * shipped one version doing exactly that, and it printed
 * `src/contract-binding.ts: found 2 at line(s) 135, 236` for a file whose only
 * real exit is at line **248** — every docblock above a match shifted the number.
 * A gate that names the wrong line sends a reader to the wrong place with full
 * confidence, which is worse than naming no line at all.
 *
 * ⚠️ THE TEST THAT SHOULD HAVE CAUGHT IT WAS VACUOUS. "Line numbers survive the
 * blanking" ran on a two-line fixture with NO block comment — it asserted the one
 * case that could not fail. The fixture below has a block comment in it, which is
 * the whole difference.
 *
 * The two passes are kept in agreement by a corpus-wide control: for every source
 * file, this and `stripTsComments` must reach the SAME verdict about whether the
 * file contains a call. So this cannot quietly drift into a second opinion about
 * what counts as code.
 */
export function blankNonCode(source: string): string {
  let out = "";
  let index = 0;
  let quote: string | null = null;

  const blank = (text: string): string => text.replace(/[^\n]/g, " ");

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (quote === null) {
      if (char === "/" && next === "/") {
        const end = source.indexOf("\n", index);
        const stop = end === -1 ? source.length : end;
        out += blank(source.slice(index, stop));
        index = stop;
        continue;
      }
      if (char === "/" && next === "*") {
        const end = source.indexOf("*/", index + 2);
        const stop = end === -1 ? source.length : end + 2;
        out += blank(source.slice(index, stop));
        index = stop;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        out += char;
        index += 1;
        continue;
      }
      out += char;
      index += 1;
      continue;
    }

    if (char === "\\") {
      out += "  ";
      index += 2;
      continue;
    }

    if (quote === "`" && char === "$" && next === "{") {
      // An interpolation is CODE. Copy it through, tracking braces so a nested
      // object literal inside it does not end it early.
      let depth = 1;
      out += "${";
      index += 2;
      while (index < source.length && depth > 0) {
        const inner = source[index];
        if (inner === "{") depth += 1;
        if (inner === "}") depth -= 1;
        out += inner;
        index += 1;
      }
      continue;
    }

    if (char === quote) {
      quote = null;
      out += char;
      index += 1;
      continue;
    }

    out += char === "\n" ? "\n" : " ";
    index += 1;
  }

  return out;
}

/**
 * Every `process.exit` call in the shipped source: which FILE, HOW MANY sites in
 * it, and what each does about `--json`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE COUNT IS THE LOAD-BEARING FIELD, AND A FILE-ONLY KEY IS A HOLE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The first version keyed on the file alone. A SECOND `process.exit` added to an
 * already-ledgered file was then silently covered — the exact defect class this
 * gate exists for, reachable inside the gate's own blind spot. Found by review,
 * not by any mutation of mine: my mutations added an exit to a file with none.
 *
 * ── Why not key on `<file>:<line>` ───────────────────────────────────────────
 *
 * Because a line number drifts on any edit ABOVE it, and every such edit would
 * produce one stale entry plus one unledgered site — a red build with no defect
 * in it, which is the kind that gets a gate switched off. There is no symbol to
 * key on either: these are statements inside anonymous listeners.
 *
 * So the key is the FILE and the obligation is the COUNT. It is stable against
 * line drift and it fails on a second site, which is what was actually being
 * asked for. The report prints the line numbers it found, so a mismatch names
 * where to look without the ledger having to store them.
 */
interface ZeroExitEntry {
  /** How many `process.exit` call sites this file is allowed to hold. */
  readonly sites: number;
  /** What each of them does about `--json`. Read by a human; length-checked. */
  readonly why: string;
}

const ZERO_EXIT_LEDGER: Readonly<Record<string, ZeroExitEntry>> = {
  "src/contract-binding.ts": {
    sites: 1,
    why:
      "--print-contract, declared on 177 commands. Terminal by design: it answers a " +
      "question and stops. Under --json it emits {contract:{command,text}} through " +
      "emitDocument; without it, the rendered text. It is the site that proved this " +
      "ledger was needed — it wrote to process.stdout directly, BELOW commander's " +
      "own door, so json-terminal-contract.ts could not reach it."
  },
  "src/commands/vibe-app-logs.ts": {
    sites: 1,
    why:
      "A SECOND Ctrl-C during a log follow, exiting 130. Not a --json surface: the " +
      "caller is a human at a terminal who has now asked twice, and 130 is the " +
      "conventional code for it. The FIRST interrupt drains and returns normally."
  }
};

interface ExitSite {
  readonly file: string;
  readonly line: number;
}

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      if (entry.name.endsWith(".d.ts")) continue;
      found.push(full);
    }
  };
  walk(root);
  return found.sort();
}

function findExitSites(): ExitSite[] {
  const sites: ExitSite[] = [];
  for (const file of sourceFiles(HERE)) {
    const cleaned = blankNonCode(readFileSync(file, "utf8"));
    cleaned.split("\n").forEach((text, index) => {
      if (/\bprocess\s*\.\s*exit\s*\(/.test(text)) {
        sites.push({ file: relative(HERE, file).replace(/\\/g, "/"), line: index + 1 });
      }
    });
  }
  return sites;
}

const sites = findExitSites();
const ledgeredFiles = Object.keys(ZERO_EXIT_LEDGER).map((key) => key.replace(/^src\//, ""));

// ─────────────────────────────────────────────────────────────────────────────
// THE DETECTOR — proven able to separate a call from a sentence about one
// ─────────────────────────────────────────────────────────────────────────────

describe("the detector reads CODE, never the prose describing it", () => {
  const finds = (source: string): boolean =>
    /\bprocess\s*\.\s*exit\s*\(/.test(blankNonCode(source));

  it("a real call is found", () => {
    expect(finds("process.exit(0);")).toBe(true);
  });

  it("a docblock naming it is NOT — 8 of this package's 11 raw matches are prose", () => {
    expect(
      finds("/**\n * commander calls `process.exit(0)` on the next line.\n */\nconst x = 1;")
    ).toBe(false);
  });

  it("a line comment naming it is NOT", () => {
    expect(finds("// process.exit(0) is what commander does here\nconst x = 1;")).toBe(false);
  });

  it("a template literal BUILDING the sentence is NOT — this one is live in the tree", () => {
    const cleaned = blankNonCode("super(`process.exit(${code})`);");
    expect(/\bprocess\s*\.\s*exit\s*\(/.test(cleaned)).toBe(false);
    // The interpolation survives, because a call could legitimately live in one.
    expect(cleaned).toContain("${code}");
  });

  it("a call INSIDE an interpolation is still found", () => {
    expect(finds("const s = `x${process.exit(1)}y`;")).toBe(true);
  });

  /**
   * 🔴 THE CASE THE PREVIOUS VERSION OF THIS FILE GOT WRONG.
   *
   * Its fixture had no block comment, so "line numbers survive" asserted the one
   * shape that could not fail — and the gate then reported line 135 for a call on
   * line 248, because the shared comment stripper deletes a block comment's
   * newlines along with its text.
   */
  it("a BLOCK COMMENT above the call does not shift its line number", () => {
    const source = ["/**", " * three", " * lines", " */", "process.exit(0);"].join("\n");
    const cleaned = blankNonCode(source).split("\n");
    expect(cleaned.length).toBe(5);
    expect(cleaned[4]).toContain("process.exit(");
    expect(cleaned.slice(0, 4).join("").trim()).toBe("");
  });

  it("a multi-line STRING does not shift the line number either", () => {
    const cleaned = blankNonCode("const a = `one\ntwo`;\nprocess.exit(0);").split("\n");
    expect(cleaned.length).toBe(3);
    expect(cleaned[2]).toContain("process.exit(");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS — a scan over nothing must REFUSE, never pass
// ─────────────────────────────────────────────────────────────────────────────

describe("controls", () => {
  it("the walk reached real source", () => {
    expect(sourceFiles(HERE).length).toBeGreaterThan(100);
  });

  it("every file THIS pass flags is also flagged by the shared stripTsComments", () => {
    // ══════════════════════════════════════════════════════════════════════════
    // THE INVARIANT IS CONTAINMENT, NOT EQUALITY, AND EQUALITY REDS ON CORRECT
    // CODE.
    // ══════════════════════════════════════════════════════════════════════════
    //
    // `stripTsComments` leaves STRING content intact by design, so a file that
    // merely MENTIONS `process.exit(` inside a string reads as a call to it.
    // This pass blanks string content too, so it says no. That is the two passes
    // working correctly, not drifting apart.
    //
    // The first version asserted EQUALITY and excluded the one divergence it knew
    // about by name — `json-one-document.scan.ts` building the message
    // `` `process.exit(${code})` ``. A second arrived within days:
    // `util/version-check.ts` emits an entire child-process script as a template
    // literal, and that script exits twice. An equality control grows a name
    // every time somebody writes the token inside a string, and every new name is
    // a red build with no defect in it — which is how a control gets deleted.
    //
    // The real property is CONTAINMENT. This pass blanks strictly more, so
    // anything it still flags is unambiguously code and the shared helper must
    // agree. `local && !shared` would mean this pass invented a call the other
    // cannot see. That IS drift, and it is what this asserts.
    const call = /\bprocess\s*\.\s*exit\s*\(/;
    const invented: string[] = [];
    let sharedOnly = 0;
    for (const file of sourceFiles(HERE)) {
      const source = readFileSync(file, "utf8");
      const mine = call.test(blankNonCode(source));
      const shared = call.test(stripTsComments(source));
      if (mine && !shared) {
        invented.push(
          `  ${relative(HERE, file)}: this pass flags a call the shared helper cannot see`
        );
      }
      if (shared && !mine) sharedOnly += 1;
    }

    expect(invented, `\n\n${invented.join("\n")}`).toEqual([]);

    // ANTI-VACUITY. If this reaches zero, either every string mention was deleted
    // or — far likelier — `blankNonCode` stopped blanking string content and the
    // containment above went trivially true.
    expect(
      sharedOnly,
      "no file mentions process.exit inside a string any more. Either that is real, " +
        "or blankNonCode stopped blanking string content and this control is now vacuous."
    ).toBeGreaterThan(0);
  });

  it("the population is NON-EMPTY — a zero here means the scan broke, not the code", () => {
    // `--print-contract` alone guarantees at least one. A selector that stopped
    // matching would empty this and every arm below would pass over nothing.
    expect(sites.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE LEDGER — three directions
// ─────────────────────────────────────────────────────────────────────────────

describe("every zero-exit terminal path is written down", () => {
  it("no call site exits without being named", () => {
    const unledgered = sites
      .filter((site) => !ledgeredFiles.includes(site.file))
      .map((site) => `  src/${site.file}:${site.line}`);

    expect(
      unledgered,
      `\n\n${unledgered.length} call site(s) end the process without a ledger entry.\n\n` +
        `A path that exits is a path that owes --json a document, and one writing to\n` +
        `process.stdout directly is BELOW commander's door — nothing in\n` +
        `json-terminal-contract.ts can reach it. Emit through emitDocument under\n` +
        `isJsonMode(), then add the entry here saying so.\n\n${unledgered.join("\n")}`
    ).toEqual([]);
  });

  it("an entry naming a file with no call site is stale and must be deleted", () => {
    const live = new Set(sites.map((site) => site.file));
    const stale = ledgeredFiles.filter((file) => !live.has(file)).sort();

    expect(
      stale,
      `\n\n${stale.length} ledger entr(y/ies) name a file that no longer exits.\n` +
        `Delete the line — a stale exemption reads as "known, accepted" to everyone ` +
        `who meets it.\n\n${stale.join("\n")}`
    ).toEqual([]);
  });

  it("a file holds exactly as many exits as its entry declares", () => {
    const counted = new Map<string, number[]>();
    for (const site of sites) {
      counted.set(site.file, [...(counted.get(site.file) ?? []), site.line]);
    }

    const wrong: string[] = [];
    for (const [key, entry] of Object.entries(ZERO_EXIT_LEDGER)) {
      const file = key.replace(/^src\//, "");
      const lines = counted.get(file) ?? [];
      if (lines.length !== entry.sites) {
        wrong.push(
          `  ${key}: declares ${entry.sites}, found ${lines.length} at line(s) ${lines.join(", ") || "none"}`
        );
      }
    }

    expect(
      wrong,
      `\n\n${wrong.length} file(s) hold a number of exits their entry does not declare.\n\n` +
        `A SECOND exit in an already-named file is the hole a file-only ledger has, and\n` +
        `it is the same defect class as the first: a path that ends without honouring\n` +
        `--json. Say what the new one does, then raise the count in the same edit.\n\n` +
        `${wrong.join("\n")}`
    ).toEqual([]);
  });

  it.each(
    eachOrRefuse(Object.entries(ZERO_EXIT_LEDGER), "ZERO_EXIT_LEDGER, the named terminal paths")
  )("%s states what it does about --json", (_file, entry) => {
    // A ledger is only worth what its reasons say. This cannot judge whether a
    // sentence is TRUE — only a reader can — but it refuses a placeholder.
    expect(entry.why.length).toBeGreaterThan(80);
    expect(entry.why.toLowerCase()).toMatch(/--json|json mode|not a --json surface/);
    expect(entry.sites).toBeGreaterThan(0);
  });
});
