import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  ENVELOPE_NARROWING_LEDGER,
  ENVELOPE_NARROWING_LEDGER_CEILING
} from "./envelope-narrowing.ledger";
import {
  type EnvelopeNarrowing,
  narrowingKey,
  narrowingsIn,
  scanEnvelopeNarrowing,
  scanPrinterCallSites
} from "./envelope-narrowing.scan";

/**
 * THE GATE UNDER `--json` COMPLETENESS, IN THREE PARTS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A SCAN THAT REPORTS NOTHING AND A SCAN THAT LOOKS AT NOTHING ARE THE SAME FILE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `envelope-narrowing.scan.ts` finds every place a printer is handed one key of
 * a multi-key response, so the rest of that response never reaches `--json`.
 * The population it reports is the whole value of the thing, and an empty
 * report is indistinguishable from a broken walk, a wrong root, or a type
 * checker that resolved no types. So the control comes FIRST here, before any
 * assertion about the real tree is allowed to mean anything.
 *
 * ── 1. THE POSITIVE CONTROL ─────────────────────────────────────────────────
 *
 * 🚨 THIS IS THE HALF THAT MAKES THE OTHER TWO READABLE. A fixture reproduces
 * the exact defect this scan was built for — `nexus folder list` before the fix,
 * the shape recorded in `NEX-3838` — and the scan must find it, name the key it
 * kept and name the key it lost. Mutating the FIXTURE is what tests the scan;
 * mutating the CLI would only test the CLI.
 *
 * Three fixtures, and the two negative ones matter as much as the positive: a
 * scan that reports everything is as useless as one that reports nothing, and
 * both of those pass a control that only ever feeds it a defect.
 *
 * ── 2. NOTHING NEW ──────────────────────────────────────────────────────────
 *
 * Every site in the real tree must be in `envelope-narrowing.ledger.ts` with the
 * exact set of keys it loses. A new narrowing is red on the day it is written.
 * Widening an EXISTING one — the response gains a key and the printer still
 * takes one — is red too, because the lost set is compared and not just the key.
 * The ledger may only shrink: its size is checked against a CEILING, so deleting
 * entries is always legal and adding one is a line in a diff.
 *
 * 🔴 THERE IS NO STALENESS ASSERTION HERE, AND ITS ABSENCE IS THE POINT. This
 * file shipped with one — "holds no entry the scan has stopped reporting" — and
 * that is a LOWER BOUND on draining data: it reds the moment somebody fixes a
 * command, and it vanishes the moment somebody fixes the last one. A gate that
 * refuses its own cure gets switched off, and then the real narrowings flow
 * again. The ledger's own docblock records the same decision.
 *
 * ── 3. THE CONTROLS THAT SURVIVE THE DRAIN ──────────────────────────────────
 *
 * The findings go to zero when this class is cured — that is the goal — so
 * "the scan found something" cannot be the anti-vacuity control. This file
 * shipped with that one too (`found.length > 0`), which fails on the day the
 * work succeeds. Two things that do NOT go to zero are asserted instead:
 *
 *   · the scan still reaches printer CALL SITES. A cured command still calls
 *     `printTable`; it simply calls it inside `printEnvelope`;
 *   · at least one real call site is exempted as a CURE. That proves the
 *     exemption arm can return true against real code — the arm whose failure
 *     mode is to report the cure — and it gets STRONGER with every command
 *     drained.
 */

const FIXTURE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "envelope-narrowing-"));

afterAll(() => {
  fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

/** Write a fixture package and scan it in isolation. */
function scanFixture(name: string, body: string): EnvelopeNarrowing[] {
  const root = path.join(FIXTURE_ROOT, name);
  fs.mkdirSync(path.join(root, "commands"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "output.ts"),
    `export function printTable<T extends object>(_rows: readonly T[], _cols: unknown): void {}
export function printList<T extends object>(_d: readonly T[], _m: unknown, _c: unknown): void {}
export function printRecord<T extends object>(_data: T, _fields?: unknown): void {}
export function printEnvelope<E extends object>(_env: E, render: () => void): void {
  render();
}
export function isJsonMode(): boolean {
  return false;
}
`
  );

  fs.writeFileSync(
    path.join(root, "api.ts"),
    `export interface Folder {
  id: string;
  name: string;
}
export interface Assignment {
  agentId: string;
  folderId: string;
}
export interface ListFoldersResponse {
  folders: Folder[];
  assignments: Assignment[];
}
export interface ListOnlyResponse {
  folders: Folder[];
}
export function listFolders(): ListFoldersResponse {
  return { folders: [], assignments: [] };
}
export function listOnly(): ListOnlyResponse {
  return { folders: [] };
}
`
  );

  fs.writeFileSync(path.join(root, "commands", "subject.ts"), body);

  return scanEnvelopeNarrowing(root);
}

describe("the scan finds the defect it was built for", () => {
  it("reports the pre-fix `nexus folder list` shape", () => {
    // Byte-for-byte the code that shipped, down to the dead `?? result`.
    const found = scanFixture(
      "positive",
      `import { printTable } from "../output";
import { listFolders } from "../api";

export function run(): void {
  const result = listFolders();
  const folders = result.folders ?? result;
  printTable(Array.isArray(folders) ? folders : [folders], []);
}
`
    );

    expect(found).toHaveLength(1);
    expect(found[0].printer).toBe("printTable");
    expect(found[0].taken).toBe("folders");
    expect(found[0].lost).toEqual(["assignments"]);
  });

  it("stays silent when the response has nothing else to lose", () => {
    // Same narrowing, one-key envelope. Reporting this would make the gate red
    // over correct code and get the whole thing switched off.
    const found = scanFixture(
      "single-key",
      `import { printTable } from "../output";
import { listOnly } from "../api";

export function run(): void {
  const result = listOnly();
  printTable(result.folders, []);
}
`
    );

    expect(found).toEqual([]);
  });

  it("stays silent once the cure is applied", () => {
    // The fix, asserted as a fix: the same response, the same table, and the
    // whole envelope handed to the printer that owns the JSON branch.
    const found = scanFixture(
      "cured",
      `import { printEnvelope, printTable } from "../output";
import { listFolders } from "../api";

export function run(): void {
  const result = listFolders();
  printEnvelope(result, () => {
    printTable(result.folders, []);
  });
}
`
    );

    expect(found).toEqual([]);
  });

  it("does not count a key read only into the terminal", () => {
    // The `analytics query` shape. `truncated` IS read — onto stderr, under
    // `!isJsonMode()` — and a script still cannot see it, so it is still lost.
    const found = scanFixture(
      "human-only-read",
      `import { isJsonMode, printList } from "../output";
import { listFolders } from "../api";

export function run(): void {
  const result = listFolders();
  printList(result.folders, undefined, []);
  if (!isJsonMode()) {
    process.stderr.write(String(result.assignments.length));
  }
}
`
    );

    expect(found).toHaveLength(1);
    expect(found[0].lost).toEqual(["assignments"]);
  });

  it("does not report a printer that only runs for the terminal", () => {
    // The `tracing get` shape. The document is already complete; the second
    // table is a human extra and can drop whatever it likes.
    const found = scanFixture(
      "human-only-printer",
      `import { isJsonMode, printRecord, printTable } from "../output";
import { listFolders } from "../api";

export function run(): void {
  const result = listFolders();
  printRecord(result);
  if (!isJsonMode()) {
    printTable(result.folders, []);
  }
}
`
    );

    expect(found).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — THE REAL TREE
// ─────────────────────────────────────────────────────────────────────────────

const CALL_SITES = scanPrinterCallSites();
const FOUND = narrowingsIn(CALL_SITES);

describe("the CLI's own narrowings are all accounted for", () => {
  const ledgered = new Map(ENVELOPE_NARROWING_LEDGER.map((entry) => [entry.key, entry]));

  it("reports nothing that is not in the ledger", () => {
    const unledgered = FOUND.filter((narrowing) => !ledgered.has(narrowingKey(narrowing))).map(
      (narrowing) => `  ${narrowing.file}:${narrowing.line} drops ${narrowing.lost.join(", ")}`
    );

    expect(
      unledgered,
      `\n\n${unledgered.length} printer call(s) drop a field the server sent.\n\n` +
        `A key the action narrows away is gone from BOTH arms by the time the printer\n` +
        `chooses between a table and a document, so \`--json\` answers a well-formed\n` +
        `document with a hole in it. The cure is \`printEnvelope(response, () => …)\` —\n` +
        `commands/folder.ts is the worked example — and it moves that command's\n` +
        `published envelope, so it goes with a changelog entry.\n\n${unledgered.join("\n")}\n`
    ).toEqual([]);
  });

  it("loses exactly the keys the ledger records", () => {
    // EXACT, and exact in the safe direction: a key the scan no longer reports
    // is not in `FOUND` and never reaches this comparison, so a cure is silent.
    // What it catches is WIDENING — the response gains a key and the printer
    // still takes one.
    const drifted = FOUND.filter((narrowing) => {
      const entry = ledgered.get(narrowingKey(narrowing));
      return entry !== undefined && entry.lost.join(",") !== narrowing.lost.join(",");
    }).map((narrowing) => `  ${narrowingKey(narrowing)} now drops ${narrowing.lost.join(", ")}`);

    expect(drifted, `\n\n${drifted.join("\n")}\n`).toEqual([]);
  });

  it("the ledger never grows", () => {
    // An UPPER bound. Draining moves this further under the ceiling and can
    // never red it; adding an entry is a line a reviewer reads.
    expect(
      ENVELOPE_NARROWING_LEDGER.length,
      "ENVELOPE_NARROWING_LEDGER_CEILING is the one edit that lets this class grow. " +
        "Lower it when a command drains; raising it needs a reason in the diff."
    ).toBeLessThanOrEqual(ENVELOPE_NARROWING_LEDGER_CEILING);
  });

  it("holds no duplicate key", () => {
    // A duplicate satisfies the subset check while describing one site twice,
    // which makes the ceiling meaningless as a measure of the class.
    const seen = new Set<string>();
    const duplicates = ENVELOPE_NARROWING_LEDGER.map((entry) => entry.key).filter((key) => {
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });

    expect(duplicates).toEqual([]);
  });

  /**
   * THE ROW SWEEP, AS AN OFFENDER ARRAY — NEITHER `eachOrRefuse` NOR
   * `emptyTableIsExpected`, AND NOT A GUARD EITHER.
   *
   * 🚨 `eachOrRefuse` THROWS on an empty table — the right default for a DERIVED
   * population, where a zero means a selector broke. This table is a debt list
   * MEANT to reach zero: this file's own comment calls empty the success state,
   * which is exactly why the sweep cannot stay.
   *
   * ⚠️ `emptyTableIsExpected` — which stood here — silences that throw and
   * fixes nothing. It returns the table unchanged and has no reach into the
   * runner. Measured on vitest 3.2.4 and 4.1.6: an empty `.each` registers no
   * test, and a `describe` left with NONE fails "No test found in suite". This
   * sweep is its `describe`'s only content, which is that case exactly.
   *
   * Collecting offenders into one array and expecting `[]` is green on an empty
   * ledger in every runner, and it prints every bad row at once.
   */
  it("every survivor says what a `--json` caller cannot see", () => {
    // A ledger is worth what its reasons say. This cannot judge whether a
    // sentence is TRUE — only a reader can — but it refuses a placeholder.
    const offenders = ENVELOPE_NARROWING_LEDGER.flatMap((entry) => [
      ...(entry.note.length > 60 ? [] : [`${entry.key} — note is ${entry.note.length} characters`]),
      ...(entry.lost.length > 0 ? [] : [`${entry.key} — names no lost field`]),
      ...(JSON.stringify([...entry.lost]) === JSON.stringify([...entry.lost].sort())
        ? []
        : [`${entry.key} — lost fields are not sorted`])
    ]);

    expect(offenders).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — THE CONTROLS THAT SURVIVE THE DRAIN
// ─────────────────────────────────────────────────────────────────────────────

describe("controls", () => {
  it("the scan reaches real printer calls", () => {
    // NOT `FOUND.length > 0`. The findings are meant to reach zero, and a
    // control that dies on success takes the gate with it. A CURED command is
    // still in this population — it still calls `printTable`, inside
    // `printEnvelope` — so a zero here means the walk broke, never that the tree
    // got clean.
    expect(
      CALL_SITES.length,
      "no file in src/ calls printTable, printList or printRecord any more. Either " +
        "every printer was renamed, or the walk stopped resolving files and every " +
        "assertion above is now passing over an empty set."
    ).toBeGreaterThan(0);
  });

  it("at least one real call site is CURED — the exemption arm can say yes", () => {
    // The arm whose failure mode is to report the cure as the disease. It cannot
    // be exercised by the findings, which are by definition the uncured ones.
    // `folder.ts` was fixed before this gate existed and every drained command
    // joins it — so this control only gets stronger.
    const cured = CALL_SITES.filter(
      (site) =>
        site.exempt === "inside-envelope" || site.exempt === "whole-response-reaches-the-document"
    ).map((site) => `${site.file}:${site.line}`);

    expect(
      cured,
      "no printer call in src/ is exempted as a cure any more. That is either a real " +
        "regression across the whole package, or insideEnvelopeCallback stopped " +
        "matching and this gate is about to report the next cure as a defect."
    ).not.toEqual([]);
  });

  it("every finding carries an exemption of null, and every exempt site no finding", () => {
    // The two halves are read off ONE walk, so they cannot drift into two
    // opinions about what a printer call is — but they could still be assembled
    // wrongly, and then the ledger would be keyed against a set nothing agrees
    // with.
    const mismatched = CALL_SITES.filter(
      (site) => (site.narrowing === null) !== (site.exempt !== null)
    ).map((site) => `  ${site.file}:${site.line} ${site.printer}`);

    expect(mismatched, `\n\n${mismatched.join("\n")}\n`).toEqual([]);
  });
});
