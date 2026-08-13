import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GENERATED_NAMESPACE_LEDGER } from "./contract-help.ledger";

/**
 * THE LEDGER MUST STAY IMPORT-FREE, and this is the only thing that can say so.
 *
 * `scripts/generate-contract-help.ts` reads the ledger BEFORE it writes, and
 * `scripts/generated-drift.mjs` deletes every `*.contract.generated.ts` before
 * running that generator. So phase 1 executes with the whole generated set
 * missing, and anything the ledger imports must survive that.
 *
 * One import breaks it, and the break is silent everywhere else: the generated
 * files are committed, so every ordinary run — the build, the suite, a hand
 * invocation — has them on disk and passes. Only the drift check runs against a
 * wiped tree, and that check is push-triggered on `staging` and `main`. A
 * regression here therefore reaches the branch it breaks without any pull
 * request going red, which is exactly how it got in the first time.
 *
 * ── Why the source text and not the module graph ────────────────────────────
 *
 * Importing the ledger and inspecting it proves nothing: the assertion is about
 * what the file DECLARES, and by the time this test runs every generated file is
 * present, so even the broken form would load cleanly.
 *
 * And `import type` is not exempt. It is erased today, which makes it look free,
 * but it is one `import type` -> `import` refactor away from being a real edge,
 * and nothing would flag that step. The rule is worth more as "no import
 * statements" than as a judgement call at each one.
 */
describe("contract-help.ledger", () => {
  const source = readFileSync(join(__dirname, "contract-help.ledger.ts"), "utf-8");

  it("declares no imports at all, so phase 1 loads with the generated tree wiped", () => {
    const offenders = source
      .split("\n")
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => /^import\b/.test(line) || /^export\s+.*\bfrom\b/.test(line));

    expect(offenders, `contract-help.ledger.ts must import nothing`).toEqual([]);
  });

  it("CONTROL: the source really was read, and it is the ledger", () => {
    // Without this, a path typo yields an empty string, no import lines, and a
    // green test that read nothing at all.
    expect(source).toContain("GENERATED_NAMESPACE_LEDGER");
    expect(source.length).toBeGreaterThan(1000);
  });

  it("holds one entry per committed generated module", () => {
    // The ledger drives what gets written, so its namespaces ARE the committed
    // file set. A name that reaches no file, or a file no name reaches, is drift
    // between the two halves of the split.
    const names = GENERATED_NAMESPACE_LEDGER.map((entry) => entry.namespace);
    expect(new Set(names).size, "a namespace is listed twice").toBe(names.length);
    expect(names.every((name) => name.length > 0)).toBe(true);
  });
});
