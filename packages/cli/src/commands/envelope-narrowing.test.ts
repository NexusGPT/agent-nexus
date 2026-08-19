import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { ENVELOPE_NARROWING_LEDGER } from "./envelope-narrowing.ledger";
import {
  type EnvelopeNarrowing,
  narrowingKey,
  scanEnvelopeNarrowing
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
 *
 * ── 3. NOTHING STALE ────────────────────────────────────────────────────────
 *
 * A ledger entry the scan no longer reports is also red. That is what keeps the
 * file shrink-only in the direction that matters: when somebody fixes one of
 * these, the ledger entry has to go with it, so the count can never quietly
 * describe a tree that has moved on.
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

describe("the CLI's own narrowings are all accounted for", () => {
  const found = scanEnvelopeNarrowing();
  const ledgered = new Map(ENVELOPE_NARROWING_LEDGER.map((entry) => [entry.key, entry]));

  it("reports nothing that is not in the ledger", () => {
    const unledgered = found
      .filter((narrowing) => !ledgered.has(narrowingKey(narrowing)))
      .map((narrowing) => `${narrowing.file}:${narrowing.line} drops ${narrowing.lost.join(", ")}`);

    expect(unledgered).toEqual([]);
  });

  it("loses exactly the keys the ledger records", () => {
    const drifted = found
      .filter((narrowing) => {
        const entry = ledgered.get(narrowingKey(narrowing));
        return entry !== undefined && entry.lost.join(",") !== narrowing.lost.join(",");
      })
      .map((narrowing) => `${narrowingKey(narrowing)} now drops ${narrowing.lost.join(", ")}`);

    expect(drifted).toEqual([]);
  });

  it("holds no entry the scan has stopped reporting", () => {
    const live = new Set(found.map(narrowingKey));
    const stale = ENVELOPE_NARROWING_LEDGER.map((entry) => entry.key).filter(
      (key) => !live.has(key)
    );

    expect(stale).toEqual([]);
  });

  it("finds the population at all", () => {
    // The scan reaching the real tree is a precondition for the three cases
    // above, and all three pass on an empty result. This is the only one that
    // does not.
    expect(found.length).toBeGreaterThan(0);
  });
});
