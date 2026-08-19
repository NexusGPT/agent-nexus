/**
 * The alias in `vitest.config.ts` maps only the specifiers `vitest.aliases.ts`
 * NAMES. Any workspace specifier this package imports that is absent from that
 * list resolves through the dependency's own `exports` map instead — which, for
 * `@agent-nexus/sdk`, means `dist/` under every one of its three conditions.
 *
 * Nothing else notices that. `tsc` resolves it happily, ESLint has no opinion,
 * and the suite goes green against whatever `dist/` happens to hold. So this
 * spec is the only thing standing between one new import line and a silent
 * return to reading a stale build.
 *
 * Each control is its OWN `it`, deliberately. Folded into one block, a broken
 * scan would satisfy the invariant vacuously (an empty set is a subset of
 * anything) and the control meant to catch that would never be evaluated.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripTsComments } from "./util/strip-ts-comments";
import { WORKSPACE_SOURCE_ALIASES } from "./vitest.aliases";

const SRC = path.resolve(__dirname);
const PKG = path.resolve(__dirname, "..");

/**
 * `test/` IS SCANNED, and that is not tidiness. Until this package folded its
 * two runners into one, `test/unit` was executed by `tsx --test` rather than by
 * vitest, so an alias could not have applied to it and scanning it would have
 * been meaningless. Those files now run under vitest through the same config, so
 * an unmapped specifier there buys exactly the stale-`dist/` read this spec
 * exists to prevent — and it would have been invisible, because the walk started
 * and stopped at `src/`.
 */
const TEST = path.resolve(PKG, "test");

/**
 * Files holding EMBEDDED CONTENT are excluded by the `.generated.` marker, never
 * by naming one file. `src/skills-content.generated.ts` is 7.5 MB of skill
 * markdown stored as string literals, and 12 of those literals are code examples
 * importing `@agent-nexus/apps-ui` — a package that does not exist in this
 * repository. They are documentation, not imports, and scanning them makes this
 * spec demand an alias for a package nothing can resolve.
 *
 * The package carries THREE such files. Excluding only the big one still reads
 * high, which is why the marker rather than a filename is the rule.
 */
const isScannable = (file: string): boolean =>
  file.endsWith(".ts") && !file.includes(".generated.");

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return isScannable(full) ? [full] : [];
  });

const SPECIFIER = /(?:from|import)\s*\(?\s*["']((?:@nexus\/|@agent-nexus\/)[^"']*)["']/g;

/**
 * Comments are removed before scanning, because PROSE ABOUT A SPECIFIER IS NOT
 * AN IMPORT OF IT. A docblock that quotes an import line — here, or in any file
 * this scan walks — would otherwise be reported as an unmapped import and fail
 * this spec on its own documentation.
 *
 * ⚠️ This is the OPPOSITE of the right call for `src/wire-types-bundle.test.ts`,
 * which scans the same directory for `@nexus/types` and deliberately does NOT
 * strip comments. The two guards fail in opposite directions: a false positive
 * here demands an alias for a package that does not exist and breaks the build,
 * while a false positive there costs a reword and a false NEGATIVE ships
 * `@nexus/types` inside the published CLI. Do not "harmonise" them.
 */
const scan = (): { files: string[]; specifiers: Map<string, string[]> } => {
  const files = [...walk(SRC), ...walk(TEST)];
  const specifiers = new Map<string, string[]>();
  for (const file of files) {
    const source = stripTsComments(fs.readFileSync(file, "utf-8"));
    for (const [, specifier] of source.matchAll(SPECIFIER)) {
      const seen = specifiers.get(specifier) ?? [];
      seen.push(path.relative(PKG, file));
      specifiers.set(specifier, seen);
    }
  }
  return { files, specifiers };
};

describe("workspace imports stay aliased to source", () => {
  it("maps every workspace specifier this package imports", () => {
    const { specifiers } = scan();
    const unmapped = [...specifiers.entries()]
      .filter(([specifier]) => !(specifier in WORKSPACE_SOURCE_ALIASES))
      .map(([specifier, files]) => `${specifier} (imported by ${files.join(", ")})`);

    expect(
      unmapped,
      "These specifiers resolve through the dependency's `exports` map, which points at " +
        "`dist/`, so this suite would test against whatever was last built rather than " +
        "against source. REMEDY: add each one to WORKSPACE_SOURCE_ALIASES in " +
        "packages/cli/src/vitest.aliases.ts, mapped to the entry's SOURCE file. Do not delete " +
        "this assertion — an unmapped specifier is the defect it exists to catch."
    ).toEqual([]);
  });

  it("CONTROL: the scan actually finds the specifier we know is there", () => {
    const { specifiers } = scan();
    expect(
      specifiers.get("@agent-nexus/sdk")?.length ?? 0,
      "The scan found no `@agent-nexus/sdk` import. This package has many, so the regex " +
        "or the walk is broken — and a broken scan satisfies the assertion above vacuously."
    ).toBeGreaterThan(10);
  });

  it("CONTROL: the scan reaches `test/`, not only `src/`", () => {
    const { files } = scan();
    expect(
      files.filter((file) => file.startsWith(`${TEST}${path.sep}`)).length,
      "The walk is not entering `test/`. Those files run under vitest through this " +
        "package's config, so an unmapped specifier there is the same defect as one in " +
        "`src/` — and a scan that never opens the directory reports it clean."
    ).toBeGreaterThan(5);
  });

  it("CONTROL: the scan reads the package's real source tree", () => {
    const { files } = scan();
    expect(
      files.length,
      "Far fewer files than this package holds. The walk is not reaching the tree, so an " +
        "empty result above would mean nothing."
    ).toBeGreaterThan(100);
  });

  it("CONTROL: the .generated. exclusion is load-bearing, not decorative", () => {
    const generated = fs
      .readdirSync(SRC)
      .filter((name) => name.includes(".generated."))
      .map((name) => path.join(SRC, name));

    expect(
      generated.length,
      "No `.generated.` files found. If they were renamed, re-check whether the exclusion " +
        "in `isScannable` still matches them before trusting a green run here."
    ).toBeGreaterThan(0);
    expect(
      generated.every((file) => !isScannable(file)),
      "A `.generated.` file is being scanned. Those hold embedded documentation whose code " +
        "examples import packages this repository does not contain."
    ).toBe(true);
  });

  it("CONTROL: comment stripping is load-bearing, and keeps strings intact", () => {
    // BOTH specifiers are ASSEMBLED, never written as one literal. This file
    // sits inside the tree the scan above walks, and a fixture is a string
    // literal — which `stripTsComments` correctly preserves, because a `//` inside
    // a string is not a comment. Spelled out in full, the unmapped one would be
    // reported as a genuine unmapped import and would fail the very invariant it
    // exists to support; the mapped one would quietly list this file among the
    // SDK's importers, which it is not. The first breaks the suite, the second
    // only makes it lie — and a fixture that lies is the harder one to notice.
    const unmapped = `@nexus/types${"/"}server`;
    const mapped = `@agent-nexus${"/"}sdk`;
    const doc = `const a = 1; // see: import x from "${unmapped}"\nimport y from "${mapped}";`;
    expect(
      [...stripTsComments(doc).matchAll(SPECIFIER)].map(([, s]) => s),
      "The stripper is not removing a specifier quoted inside a comment, or it is " +
        "removing a real import along with it. Either way the scan above is measuring " +
        "the wrong text."
    ).toEqual(["@agent-nexus/sdk"]);

    expect(
      stripTsComments('const url = "https://example.com/a"; // gone'),
      "The stripper ate the inside of a string literal. `//` in a URL is not a comment."
    ).toBe('const url = "https://example.com/a"; ');
  });

  it("CONTROL: every alias points at a source file that exists", () => {
    const missing = Object.entries(WORKSPACE_SOURCE_ALIASES)
      .filter(([, source]) => !fs.existsSync(path.resolve(PKG, source)))
      .map(([specifier, source]) => `${specifier} -> ${source}`);

    expect(
      missing,
      "An alias names a path that is not on disk. Vite would fail to resolve the specifier " +
        "at run time, or silently fall through, depending on the caller."
    ).toEqual([]);
  });
});
