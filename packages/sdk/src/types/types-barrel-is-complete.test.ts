import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * THE GATE for `types/index.ts`.
 *
 * That barrel is `export type *` per module, which cannot drop a TYPE — but
 * TypeScript has no glob import, so the module list itself is written by hand
 * and drifts exactly like the name list it replaced. The rewrite that introduced
 * it proved the point immediately: it derived its list from the old file's
 * `from "./x"` clauses and inherited that file's two omissions, so
 * `customers.ts` and `skill-folders.ts` stayed unreachable while the header
 * claimed every type under `types/` was exported.
 *
 * Nothing failed. `client.customers.create()` was still callable, its
 * `CreateCustomerBody` still unnameable, and `as any` still the only way for a
 * consumer to pass one — which is the whole defect the barrel exists to close.
 *
 * So the list is checked against the directory rather than against attention.
 */

const TYPES_DIR = __dirname;
const BARREL = path.join(TYPES_DIR, "index.ts");

function moduleFiles(): string[] {
  return fs
    .readdirSync(TYPES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts"))
    .map((f) => f.replace(/\.ts$/, ""))
    .filter((m) => m !== "index")
    .sort();
}

function exportedModules(): string[] {
  const src = fs.readFileSync(BARREL, "utf-8");
  return [...src.matchAll(/^export type \* from "\.\/([a-z0-9-]+)";$/gm)].map((m) => m[1]).sort();
}

describe("types/index.ts is a complete barrel", () => {
  it("re-exports every module in this directory", () => {
    const missing = moduleFiles().filter((m) => !exportedModules().includes(m));
    expect(
      missing,
      `types/index.ts does not re-export: ${missing.join(", ")}. ` +
        `Every module here is part of the SDK's public contract — add ` +
        `\`export type * from "./<name>";\` for each.`
    ).toEqual([]);
  });

  it("names no module that does not exist", () => {
    const orphaned = exportedModules().filter((m) => !moduleFiles().includes(m));
    expect(
      orphaned,
      `types/index.ts re-exports modules that are gone: ${orphaned.join(", ")}`
    ).toEqual([]);
  });

  /**
   * Without this the two assertions above are vacuously true over an empty
   * directory read — a `readdirSync` pointed at the wrong path returns `[]`,
   * both sets are empty, both comparisons pass, and the gate proves nothing.
   */
  it("actually read the directory", () => {
    expect(moduleFiles().length).toBeGreaterThan(20);
    expect(exportedModules().length).toBeGreaterThan(20);
  });
});
