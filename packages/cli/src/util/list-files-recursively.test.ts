import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { listFilesRecursively } from "./list-files-recursively";

/**
 * The walker every `src/commands` text gate reads its population through. The
 * property that matters is DEPTH: a top-level-only listing is what let a command
 * moved into a subdirectory fall out of every gate while each stayed green.
 */
const ROOT = mkdtempSync(join(tmpdir(), "nexus-list-files-"));

const touch = (relativePath: string, root: string = ROOT): void => {
  const full = join(root, relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, "");
};

touch("top.ts");
touch("top.test.ts");
touch("role/leaf.command.ts");
touch("role/leaf.command.test.ts");
touch("role/deep/nested/deepest.ts");
touch("role/notes.md");

/** A second tree, so the name-prefix fixtures cannot enter the exact sets above. */
const PREFIXED = mkdtempSync(join(tmpdir(), "nexus-list-files-prefixed-"));

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  rmSync(PREFIXED, { recursive: true, force: true });
});

const isSource = (name: string): boolean => name.endsWith(".ts") && !name.endsWith(".test.ts");

describe("listFilesRecursively", () => {
  it("returns a file two directories down", () => {
    expect(listFilesRecursively(ROOT, isSource)).toContain("role/deep/nested/deepest.ts");
  });

  it("returns every kept file at every depth, relative and sorted, and nothing else", () => {
    expect(listFilesRecursively(ROOT, isSource)).toEqual([
      "role/deep/nested/deepest.ts",
      "role/leaf.command.ts",
      "top.ts"
    ]);
  });

  it("hands the filter the BASE name, so a suffix exclusion holds at depth", () => {
    const seen: string[] = [];
    listFilesRecursively(ROOT, (name) => {
      seen.push(name);
      return true;
    });
    expect(seen.sort()).toEqual([
      "deepest.ts",
      "leaf.command.test.ts",
      "leaf.command.ts",
      "notes.md",
      "top.test.ts",
      "top.ts"
    ]);
  });

  it("never returns a directory, whatever the filter accepts", () => {
    expect(listFilesRecursively(ROOT, () => true)).not.toContain("role");
  });
});

/**
 * The walker filters FILES by base name and filters no DIRECTORY at all. That is
 * the contract the gates depend on: `src/commands/role/_shared/` is gated source,
 * and a recursion that skipped `_`-prefixed directories dropped every file in it
 * while the whole CLI suite stayed green.
 * A `.`-prefixed directory is the same class of name filter one character away,
 * so it is pinned too. Each prefix gets its own subroot so a red names one arm.
 */
describe("listFilesRecursively — no directory is skipped by its name", () => {
  touch("underscore/_shared/one.ts", PREFIXED);
  touch("underscore/_shared/deeper/two.ts", PREFIXED);
  touch("underscore/direct.ts", PREFIXED);
  touch("dot/.hidden/three.ts", PREFIXED);
  touch("dot/direct.ts", PREFIXED);

  it("walks an `_`-prefixed directory, at every depth under it", () => {
    expect(listFilesRecursively(join(PREFIXED, "underscore"), isSource)).toEqual([
      "_shared/deeper/two.ts",
      "_shared/one.ts",
      "direct.ts"
    ]);
  });

  it("walks a `.`-prefixed directory", () => {
    expect(listFilesRecursively(join(PREFIXED, "dot"), isSource)).toEqual([
      ".hidden/three.ts",
      "direct.ts"
    ]);
  });
});
