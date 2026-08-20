import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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
 * 🔴 A RATCHET TURNS ONE WAY. EVERY ASSERTION HERE IS AN UPPER BOUND.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This file shipped with three assertions that were lower bounds on the very
 * data it wants drained — an EXACT site count per file, "an entry naming a file
 * with no call site is stale", and `sites.length > 0`. Each of them reds when
 * somebody removes an exit, and the last two vanish or fail outright when the
 * list reaches zero. A gate that refuses its own cure gets switched off, and
 * then the real defect flows again.
 *
 * So: adding an exit is red, by file and by line. REMOVING one is silently
 * legal, always, and every control below is written to survive the list reaching
 * zero.
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
 * Every `process.exit` call in the shipped source: which FILE, HOW MANY sites it
 * is ALLOWED to hold, and what each does about `--json`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE ALLOWANCE IS THE LOAD-BEARING FIELD, AND A FILE-ONLY KEY IS A HOLE
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
 * So the key is the FILE and the obligation is the number of sites. It is stable
 * against line drift and it fails on a second site, which is what was actually
 * being asked for. The report prints the line numbers it found, so a mismatch
 * names where to look without the ledger having to store them.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 AN UPPER BOUND, NOT AN EXACT COUNT — AND THE FILE SHIPPED WITH AN EXACT ONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `found !== declared` reds from BOTH directions, and one of them is the cure:
 * delete an exit and this gate turns red until somebody edits a number in a test
 * file. It also reds on an unrelated merge that leaves the ledger one under. Both
 * are red builds with no defect in them, and that is how a gate gets switched
 * off rather than obeyed.
 *
 * So the obligation is `found <= maxSites`. Adding an exit is still red, by name
 * and by line. REMOVING one is silently legal, and a file that drains to zero
 * exits keeps a harmless entry exempting nothing — delete it when you notice.
 * {@link ZERO_EXIT_LEDGER_CEILING} is what stops the allowances growing.
 */
interface ZeroExitEntry {
  /** The MOST `process.exit` call sites this file may hold. Never an equality. */
  readonly maxSites: number;
  /** What each of them does about `--json`. Read by a human; length-checked. */
  readonly why: string;
}

/**
 * The most sites this whole ledger may allow, summed across its files.
 *
 * An UPPER bound, for the same reason each entry is one. Draining moves the sum
 * further under it and can never red a build; raising an allowance or naming a
 * new file is the single edit that lets this class grow, and it needs a reason a
 * reviewer reads in the same diff.
 */
const ZERO_EXIT_LEDGER_CEILING = 2;

const ZERO_EXIT_LEDGER: Readonly<Record<string, ZeroExitEntry>> = {
  "src/contract-binding.ts": {
    maxSites: 1,
    why:
      "--print-contract, declared on 177 commands. Terminal by design: it answers a " +
      "question and stops. Under --json it emits {contract:{command,text}} through " +
      "emitDocument; without it, the rendered text. It is the site that proved this " +
      "ledger was needed — it wrote to process.stdout directly, BELOW commander's " +
      "own door, so json-terminal-contract.ts could not reach it."
  },
  "src/commands/vibe-app-logs.ts": {
    maxSites: 1,
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

/**
 * Every `process.exit` call site under `root`.
 *
 * The root is a PARAMETER so the whole pipeline — walk, read, blank, match,
 * relative path, line number — can be driven over a fixture corpus whose content
 * is known. That control is the one that survives this class being drained to
 * zero; see `controls` below.
 */
function findExitSites(root: string = HERE): ExitSite[] {
  const sites: ExitSite[] = [];
  for (const file of sourceFiles(root)) {
    const cleaned = blankNonCode(readFileSync(file, "utf8"));
    cleaned.split("\n").forEach((text, index) => {
      if (/\bprocess\s*\.\s*exit\s*\(/.test(text)) {
        sites.push({ file: relative(root, file).replace(/\\/g, "/"), line: index + 1 });
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

  it("the WHOLE pipeline finds a planted exit — walk, read, blank, line, path", () => {
    // ══════════════════════════════════════════════════════════════════════════
    // 🔴 NOT `sites.length > 0`, WHICH IS WHAT THIS FILE SHIPPED WITH.
    // ══════════════════════════════════════════════════════════════════════════
    //
    // That assertion is a LOWER BOUND on draining data. `process.exit` is
    // correct in several of the named paths, so this population is not on its
    // way to zero today — but nothing stops it, and the day somebody removes the
    // last one, the control fails and takes the gate down with it. A control
    // that dies when the work succeeds is the same defect as a gate that reds on
    // its own cure.
    //
    // What it was really asking is whether the pipeline can find anything at
    // all, and a fixture corpus answers that without depending on what the real
    // tree happens to contain. Every arm is exercised: the directory walk, the
    // `.test.ts` exclusion, the comment blanking, the line number, and the path
    // made relative to the root it was given.
    const root = mkdtempSync(join(tmpdir(), "zero-exit-pipeline-"));
    try {
      mkdirSync(join(root, "nested"), { recursive: true });
      writeFileSync(
        join(root, "nested", "real.ts"),
        ["/**", " * three", " * lines", " */", "process.exit(0);"].join("\n")
      );
      writeFileSync(join(root, "prose.ts"), "// process.exit(0) is what commander does\n");
      writeFileSync(join(root, "ignored.test.ts"), "process.exit(0);\n");

      expect(findExitSites(root)).toEqual([{ file: "nested/real.ts", line: 5 }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

  // 🔴 THERE IS NO "THIS ENTRY IS STALE" ASSERTION, AND THIS FILE SHIPPED WITH
  // ONE: "an entry naming a file with no call site is stale and must be
  // deleted". That is a LOWER BOUND on draining data. Removing a `process.exit`
  // — which is exactly what this gate wants to happen — turned the build red
  // until somebody also deleted a line from a test file, and the person who
  // removed the LAST one deleted the gate. A left-behind entry exempts a file
  // that no longer exits, which costs nothing; delete it when you notice.

  it("a file holds no more exits than its entry allows", () => {
    // An UPPER bound per file. A SECOND exit in an already-named file is the
    // hole a file-only ledger has, and it is still red here. Removing one is
    // silently legal, which is the whole difference from an exact count.
    const counted = new Map<string, number[]>();
    for (const site of sites) {
      counted.set(site.file, [...(counted.get(site.file) ?? []), site.line]);
    }

    const wrong: string[] = [];
    for (const [key, entry] of Object.entries(ZERO_EXIT_LEDGER)) {
      const file = key.replace(/^src\//, "");
      const lines = counted.get(file) ?? [];
      if (lines.length > entry.maxSites) {
        wrong.push(
          `  ${key}: allows ${entry.maxSites}, found ${lines.length} at line(s) ${lines.join(", ") || "none"}`
        );
      }
    }

    expect(
      wrong,
      `\n\n${wrong.length} file(s) hold more exits than their entry allows.\n\n` +
        `A SECOND exit in an already-named file is the hole a file-only ledger has, and\n` +
        `it is the same defect class as the first: a path that ends without honouring\n` +
        `--json. Say what the new one does, then raise the allowance AND the ceiling in\n` +
        `the same edit.\n\n${wrong.join("\n")}`
    ).toEqual([]);
  });

  it("the ledger never grows", () => {
    // The second half of the upper bound. Per-file allowances alone cannot stop
    // a NEW file being named, so the sum is bounded too — one number, one edit,
    // and every direction growth can arrive from passes through it.
    const allowed = Object.values(ZERO_EXIT_LEDGER).reduce(
      (total, entry) => total + entry.maxSites,
      0
    );

    expect(
      allowed,
      "ZERO_EXIT_LEDGER_CEILING is the one edit that lets this class grow. Lower it " +
        "when a path drains; raising it needs a reason in the diff."
    ).toBeLessThanOrEqual(ZERO_EXIT_LEDGER_CEILING);
  });

  /**
   * THE ROW SWEEP, AS AN OFFENDER ARRAY — NEITHER `eachOrRefuse` NOR
   * `emptyTableIsExpected`, AND NOT A GUARD EITHER.
   *
   * 🚨 `eachOrRefuse` THROWS on an empty table — the right default for a DERIVED
   * population, where a zero means a selector broke. `ZERO_EXIT_LEDGER` is
   * hand-written debt that is allowed to reach zero, and empty here means
   * nothing in this package ends the process itself any more, which this file
   * calls a legal end state. That makes it the sweep in this class most likely
   * to actually get there.
   *
   * ⚠️ `emptyTableIsExpected` — which stood here — silences the throw and fixes
   * nothing. It returns the table unchanged and has no reach into the runner.
   * Measured on vitest 3.2.4 and 4.1.6: an empty `.each` registers no test, and
   * a `describe` left with NONE fails "No test found in suite". This sweep is
   * its `describe`'s only content, which is that case exactly.
   *
   * Collecting offenders into one array and expecting `[]` is green on an empty
   * ledger in every runner, and it prints every bad row at once.
   */
  it("every entry states what it does about --json", () => {
    // A ledger is only worth what its reasons say. This cannot judge whether a
    // sentence is TRUE — only a reader can — but it refuses a placeholder.
    const offenders = Object.entries(ZERO_EXIT_LEDGER).flatMap(([file, entry]) => [
      ...(entry.why.length > 80 ? [] : [`${file} — why is ${entry.why.length} characters`]),
      ...(/--json|json mode|not a --json surface/.test(entry.why.toLowerCase())
        ? []
        : [`${file} — why never mentions --json`]),
      ...(entry.maxSites > 0 ? [] : [`${file} — allows ${entry.maxSites} sites`])
    ]);

    expect(offenders).toEqual([]);
  });
});
