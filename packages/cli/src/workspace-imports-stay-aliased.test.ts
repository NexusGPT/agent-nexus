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
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripTsComments } from "./util/strip-ts-comments";

const SRC = path.resolve(__dirname);
const PKG = path.resolve(__dirname, "..");

/**
 * Where a specifier LANDS with no alias applied, asked of node's own resolver.
 *
 * 🔴 THIS REPLACED A LOOKUP IN THE DERIVED TABLE, AND THE TABLE WAS SILENT ON TWO
 * CLASSES THE MESSAGE BELOW CLAIMS TO CATCH. That table is derived from each
 * `workspace:` dependency's `exports`, so a specifier is absent from it whenever the
 * dependency declares no `exports` at all — which is also true of a SUBPATH naming a
 * file that is not on disk, and of a package that is not installed here at all. Both
 * were reported `ok`. Measured in this package: `DIST_BUILT.size` 71, holding
 * `@nexus/types`, and both of those classes absent from it.
 *
 * `require.resolve` IS the resolution, so there is no model of `exports` conditions,
 * `main`, `module` or the legacy subpath rule to get subtly wrong — and a specifier
 * that resolves nowhere is reported rather than silently passed. The classification
 * is shared with the SDK's and the frontend's twins of this gate, in
 * `@nexus/config/lib/unaliased-resolution.cjs`, so the three cannot disagree about
 * what counts as a build read. The SCAN below stays this package's own.
 *
 * REQUIRED at run time, typed by its `.d.cts`: a value import would put the CommonJS
 * file into this package's `tsc` program, which refuses it.
 */
const RESOLUTION: typeof import("@nexus/config/lib/unaliased-resolution.cjs") = createRequire(
  __filename
)("@nexus/config/lib/unaliased-resolution.cjs");

/** Read off the function rather than imported, so the two cannot drift. */
type UnaliasedResolution = ReturnType<typeof RESOLUTION.unaliasedResolution>;

const unaliasedResolution = (specifier: string): UnaliasedResolution =>
  RESOLUTION.unaliasedResolution(specifier, PKG);

/**
 * The two verdicts that need no alias. `source` is a real file outside the
 * dependency's build output. `published` is a REGISTRY dependency's own build, which
 * belongs to its publisher and which nothing in this repository can make stale —
 * this package imports no such specifier today, and `apps/frontend` imports 1,537
 * of them, which is why the verdict exists rather than being a guard against nothing.
 */
const NEEDS_NO_ALIAS: ReadonlySet<UnaliasedResolution["kind"]> = new Set(["source", "published"]);

/**
 * The table `vitest.aliases.ts` exports, computed the way that module computes it. That
 * module sits at the package root, which this `src/` spec cannot import (`TS6059` under
 * `rootDir: "src"`), so it asks the same derivation for the same directory.
 */
const SOURCE_ALIASES: typeof import("@nexus/config/lib/source-aliases.cjs") = createRequire(
  __filename
)("@nexus/config/lib/source-aliases.cjs");
const WORKSPACE_SOURCE_ALIASES = SOURCE_ALIASES.sourceAliasesFor(PKG);

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
      .map(([specifier, files]) => ({ specifier, files, at: unaliasedResolution(specifier) }))
      .filter(({ at }) => !NEEDS_NO_ALIAS.has(at.kind))
      .map(
        ({ specifier, files, at }) =>
          `${specifier} [${at.kind}: ${at.detail}] (imported by ${files.join(", ")})`
      );

    expect(
      unmapped,
      "Each of these imports is absent from `vitest.aliases.ts` AND does not resolve to " +
        "something this suite may safely read. `build` means it resolves into a " +
        "`workspace:` dependency's build output, so the suite tests whatever was last built " +
        "rather than source — the alias table is derived from that dependency's `exports`, " +
        "so such an entry is one whose `default` names no source file that exists, and the " +
        "REMEDY is to give it one. `absent` means it resolves nowhere at all — a renamed or " +
        "deleted file, or a package that is not a dependency here — and the remedy is to fix " +
        "the specifier or declare the dependency. Do not delete this assertion, and do not " +
        "exempt a package to satisfy it: a specifier that genuinely ships as source already " +
        "passes, because this arm asks node where it lands rather than whether somebody " +
        "listed it, and so does one into a REGISTRY dependency's own build."
    ).toEqual([]);
  });

  it("CONTROL: the dependencies this package reads from a build are reported as `build`", () => {
    // 🔴 THE ARM ABOVE EXEMPTS EVERY `source` AND `published` VERDICT, so a classifier
    // that answered one of those for everything would satisfy it over any tree at all.
    // This is the non-zero control, and it is the SAME claim the old `DIST_BUILT`
    // population control made — that these three are read from a build when unaliased —
    // measured through the live classifier instead of through a model of `exports`.
    //
    // Every verdict is collected and asserted ONCE: three `expect`s in a row would stop
    // at the first failure, leaving the other two unscored by any mutant that moves them
    // together. Spelled whole rather than assembled, because `SPECIFIER` matches only a
    // quote preceded by `from` or `import` and an array element is neither.
    const subjects = ["@agent-nexus/sdk", "@nexus/types", "@nexus/vibe-app-vendoring"];
    expect(
      subjects.map((specifier) => `${specifier}: ${unaliasedResolution(specifier).kind}`),
      "Each of these routes its `node` condition to `dist/` and is a `workspace:` dependency " +
        "here, so with no alias applied each must be reported as a build read. Anything else " +
        "means `unaliasedResolution` can no longer tell a build from source, and the arm " +
        "above is passing vacuously."
    ).toEqual(subjects.map((specifier) => `${specifier}: build`));
  });

  it("CONTROL: a specifier naming a file that does not exist is reported as `absent`", () => {
    // The strengthening over a table lookup, pinned. A table is silent about a
    // specifier nobody ever listed; this arm is not. The name is ASSEMBLED, never
    // written whole: this file sits inside the tree `scan()` walks, and a literal
    // would be read as a genuine import and fail the arm above on its own fixture.
    const coined = `@nexus${"/"}config/lib/${"no-such-helper"}.mjs`;
    expect(
      unaliasedResolution(coined),
      "A subpath into an `exports`-less dependency resolves to the literal file path, so one " +
        "naming a file that is not on disk resolves nowhere and must be reported. If this " +
        "reads `source`, the resolution is not being attempted at all."
    ).toMatchObject({ kind: "absent" });
  });

  it("CONTROL: a specifier into a package that is not installed is reported as `absent`", () => {
    // The second class the derived table was silent on. ASSEMBLED for the same reason.
    const coined = `@nexus${"/"}absent-${"package"}/x.js`;
    expect(
      unaliasedResolution(coined),
      "A package with no `node_modules` entry here resolves nowhere, and a derived table " +
        "built from installed dependencies cannot see it. If this reads anything but " +
        "`absent`, the link check is not running."
    ).toMatchObject({ kind: "absent" });
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
