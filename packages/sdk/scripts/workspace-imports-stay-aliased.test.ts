/**
 * The alias in `vitest.config.ts` maps only the specifiers `vitest.aliases.ts`
 * NAMES. A workspace specifier this package imports that is absent from that list
 * is resolved by the runner on its own terms — and for `@nexus/types`, whose
 * `exports` map points its `node` condition at `dist/`, that means the suite reads
 * whatever was last built.
 *
 * Nothing else notices that. `tsc` resolves the same specifier to source (it does
 * not match `node` under `moduleResolution: "bundler"`), ESLint has no opinion,
 * and the suite goes green against a stale contract. So this spec is the only
 * thing standing between one new import line and a silent return to reading a
 * stale build.
 *
 * 🔴 ABSENT FROM THE TABLE IS NOT THE SAME QUESTION AS RESOLVES TO A BUILD, and
 * conflating them makes this gate refuse correct code. The table is derived from
 * each dependency's `exports`, so a dependency that declares NO `exports` map
 * contributes no rows to it and every specifier into that package is absent by
 * construction — while node resolves a SUBPATH into such a package to the literal
 * file path, which is source unless the written path says `dist/`. `@nexus/config`
 * is exactly that: no `exports`, no `main`, helpers that ship as source. So
 * `@nexus/config/lib/strip-comments.mjs` already resolves to the file this gate
 * wants, and demanding a row for it is a remedy nobody can write — the derivation
 * has no `exports` entry to give a source target to.
 *
 * ⚠️ The narrowing is to SUBPATHS and the distinction is load-bearing. A BARE
 * specifier into an `exports`-less package resolves through `main`, which can name
 * a build as readily as a source file — so exempting a package wholesale would open
 * the hole this gate exists to close. Measured under this repo's own vitest and
 * under node, on a fixture package carrying `main: "./dist/index.js"` and no
 * `exports`: the bare specifier resolved to `dist/index.js`, the subpath
 * `lib/helper.mjs` to that literal source file, and the subpath `dist/deep.mjs`
 * into the build — because the written path said so.
 *
 * ✅ So the offender arm below asks the question it means, and it asks it of node's
 * OWN resolver rather than of a model of one. A model would have to re-derive
 * `exports` conditions, `main`, `module` and the legacy subpath rule, and be wrong
 * about whichever it got subtly different; `require.resolve` IS the resolution, so
 * there is nothing to get wrong. It is also STRICTLY STRONGER than asking the
 * derived table: a specifier naming a file that is not on disk resolves nowhere and
 * is reported here, where a table lookup is silent about it.
 *
 * The classification itself is `@nexus/config/lib/unaliased-resolution.cjs`, shared
 * with the CLI's and the frontend's twins of this gate so the three cannot disagree
 * about what counts as a build read. The SCAN below stays this package's own.
 *
 * Imports are read off the AST by `moduleLoadsIn`, the reader this repository's
 * governance scans share, rather than a regex. It walks import NODES — `import type`,
 * `export … from`, `import x = require()`, `require()`, `import()` and a type-position
 * `typeof import()` — so prose that quotes an import line is not a node and is never
 * an import, whatever else the file contains.
 *
 * 🔴 NOT `ts.preProcessFile`, THE COMPILER'S OWN IMPORT SCANNER, AND THE REASON IS
 * MEASURED RATHER THAN STYLISTIC. It is a TOKEN scanner that does not recognise a
 * regex literal, so the `"`, `'` and backtick characters inside one are read as
 * string and template delimiters. That desynchronises its tracking, and a LATER
 * template literal's CONTENTS are then scanned as code — so an import line quoted
 * inside a template is reported as an import. Comments and quoted strings it does
 * skip correctly, which is why the control arm below passed under it for as long as
 * its fixture held only those two. `moduleLoadsIn`'s own header carries the second
 * defect — a method named `require` read as a load, 17 of them in `apps/vibe-provisioner`
 * — and the measurement of what this reader costs.
 *
 * Measured on typescript 6.0.3: this package's 156 scanned files leak NOTHING through
 * either scanner — in BOTH directions, so the swap changes no verdict here. The one
 * that did is `apps/frontend`, which holds such a regex in a `vi.mock` matcher and
 * leaked four specifiers through it. The reader is shared so that the two gates cannot
 * differ in what counts as an import, and so the defect does not wait in this tree for
 * the first regex of that shape to be written.
 *
 * Each control is its OWN `it`, deliberately. Folded into one block, a broken scan
 * would satisfy the invariant vacuously (an empty set is a subset of anything) and
 * the control meant to catch that would never be evaluated.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { eachOrRefuse } from "@nexus/types-testing/each-or-refuse";
import { moduleLoadsIn } from "@nexus/types-testing/module-loads";
import { describe, expect, it } from "vitest";

import { WORKSPACE_SOURCE_ALIASES } from "../vitest.aliases";

const PKG = path.resolve(__dirname, "..");

/**
 * REQUIRED at run time, typed by its `.d.cts`, for `BUILD_OUTPUT_DIR` — the one
 * spelling of the directory a workspace build writes, shared with the derivation
 * behind `vitest.aliases.ts` so the two cannot disagree about what "built" means.
 */
const WORKSPACE_SOURCES: typeof import("@nexus/config/lib/workspace-sources.cjs") = createRequire(
  __filename
)("@nexus/config/lib/workspace-sources.cjs");

/**
 * The shared classifier: where a specifier lands with no alias applied, asked of
 * node's own resolver. REQUIRED at run time for the same reason as the line above.
 */
const RESOLUTION: typeof import("@nexus/config/lib/unaliased-resolution.cjs") = createRequire(
  __filename
)("@nexus/config/lib/unaliased-resolution.cjs");

/** Read off the function rather than imported, so the two cannot drift. */
type UnaliasedResolution = ReturnType<typeof RESOLUTION.unaliasedResolution>;

/** Every tree `vitest.config.ts`'s `include` reaches, and so every tree an alias must cover. */
const SCANNED_TREES = ["src", "scripts"].map((tree) => path.join(PKG, tree));

const WORKSPACE_SCOPE = /^@(nexus|agent-nexus)\//;

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full.endsWith(".ts") ? [full] : [];
  });

const importsOf = (file: string, source: string): string[] =>
  moduleLoadsIn(file, source).filter((specifier): specifier is string => specifier !== null);

/**
 * The scanned files that load a module by a COMPUTED specifier, each with its reason.
 *
 * `moduleLoadsIn` reports one as `null`, because `import(name)` names no module a scan
 * could judge. Counted rather than dropped: a file loading `` import(`@nexus/${entry}`) ``
 * would import a workspace entry this gate could never see, and a scanner allowed to
 * shrug at an unplaceable load has a denominator of whatever it happened to understand.
 *
 * No file under `src` is here, and that is the property that makes this gate's
 * population complete: nothing this package SHIPS loads a module by a name the scan
 * cannot read.
 */
const COMPUTED_LOADS_ALLOWED: ReadonlyArray<string> = [
  // This gate's own runtime arm, which imports each specifier under test to prove
  // where it LANDS — the one thing a literal specifier cannot express.
  path.join("scripts", "workspace-imports-stay-aliased.test.ts")
];

const scan = (): {
  files: string[];
  specifiers: Map<string, string[]>;
  computed: string[];
} => {
  const files = SCANNED_TREES.flatMap(walk);
  const specifiers = new Map<string, string[]>();
  const computed: string[] = [];
  for (const file of files) {
    const relative = path.relative(PKG, file);
    const loads = moduleLoadsIn(relative, fs.readFileSync(file, "utf-8"));
    if (loads.some((specifier) => specifier === null)) computed.push(relative);
    for (const specifier of loads) {
      if (specifier === null || !WORKSPACE_SCOPE.test(specifier)) continue;
      const seen = specifiers.get(specifier) ?? [];
      seen.push(relative);
      specifiers.set(specifier, seen);
    }
  }
  return { files, specifiers, computed };
};

const splitSpecifier = RESOLUTION.splitWorkspaceSpecifier;

/**
 * Where a specifier lands with no alias applied, asked from THIS package so
 * `node_modules` resolution starts where the suite runs.
 *
 * `build` and `absent` are the two defects. `source` and `published` need no alias:
 * a real file outside the dependency's build output, and a REGISTRY dependency's
 * build, which belongs to its publisher and which nothing here can make stale.
 */
const unaliasedResolution = (specifier: string): UnaliasedResolution =>
  RESOLUTION.unaliasedResolution(specifier, PKG);

/** The two verdicts that need no alias, in one place so every arm agrees. */
const NEEDS_NO_ALIAS: ReadonlySet<UnaliasedResolution["kind"]> = new Set(["source", "published"]);

/**
 * The workspace specifiers this package imports. The runtime arm below loads only these:
 * the table is derived from every dependency's `exports`, so it also carries entries this
 * package never imports — `@nexus/types/server` and the node-only `testing/*` harness
 * among them — and loading one of those here would test an import that is never made.
 */
const IMPORTED = new Set(scan().specifiers.keys());

describe("workspace imports stay aliased to source", () => {
  it("maps every workspace specifier this package would otherwise read from a build", () => {
    const { specifiers } = scan();
    const unmapped = [...specifiers.entries()]
      .filter(([specifier]) => !(specifier in WORKSPACE_SOURCE_ALIASES))
      .map(([specifier, files]) => ({ specifier, files, at: unaliasedResolution(specifier) }))
      .filter(({ at }) => !NEEDS_NO_ALIAS.has(at.kind))
      .map(
        ({ specifier, files, at }) =>
          `${specifier} [${at.kind}: ${at.detail}] (${files.join(", ")})`
      );

    expect(
      unmapped,
      "Each of these imports is absent from `vitest.aliases.ts` AND does not resolve to a " +
        "source file of its own dependency, so this suite reads it from somewhere it should " +
        "not. `build` means the specifier resolves into the dependency's build output, so " +
        "the suite tests whatever was last built rather than source — the table is derived " +
        "from each dependency's `exports`, so such an entry is one whose `default` names no " +
        "source file that exists, and the REMEDY is to give it one. `absent` means it " +
        "resolves nowhere at all — a renamed or deleted file, or a package that is not a " +
        "dependency here — and the remedy is to fix the specifier or declare the dependency. " +
        "Do not delete this assertion, and do not exempt a package to satisfy it: a " +
        "specifier that genuinely ships as source already passes, because this arm asks " +
        "node where it lands rather than whether somebody listed it, and so does one into a " +
        "REGISTRY dependency's own build, which no change in this repository can make stale."
    ).toEqual([]);
  });

  it("CONTROL: an unaliased dist-built specifier is reported as `build`", () => {
    // 🔴 THE ARM ABOVE EXEMPTS EVERY `source` VERDICT, so a resolver that answered
    // `source` for everything would satisfy it over any tree at all. This is the
    // non-zero control: the specifier this package imports most is genuinely served
    // from `dist/` when no alias applies, which is the whole reason the table exists.
    // Without it, the arm above and a broken classifier are the same green.
    const at = unaliasedResolution("@nexus/types");
    expect(
      at,
      "`@nexus/types` resolves its `node` condition to `dist/`, so with no alias applied it " +
        "must be reported as a build read. Anything else means `unaliasedResolution` can no " +
        "longer tell a build from source, and the arm above is passing vacuously."
    ).toMatchObject({ kind: "build" });
    expect(
      at.detail,
      "the reported path should name the build output directory it was found in"
    ).toContain(WORKSPACE_SOURCES.BUILD_OUTPUT_DIR);
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

  it("CONTROL: the scan finds the specifier this package is known to import", () => {
    const { specifiers } = scan();
    expect(
      specifiers.get("@nexus/types/public-api-v1")?.length ?? 0,
      "The scan found too few `@nexus/types/public-api-v1` imports. The contract gates " +
        "import it from several files, so the walk or the import reader is broken — and a " +
        "broken scan satisfies the assertion above vacuously."
    ).toBeGreaterThanOrEqual(4);
  });

  it("CONTROL: the scan reaches `scripts/`, not only `src/`", () => {
    const { specifiers } = scan();
    const fromScripts = [...specifiers.values()]
      .flat()
      .filter((file) => file.startsWith(`scripts${path.sep}`));
    expect(
      fromScripts.length,
      "No workspace import found under `scripts/`. `vitest.config.ts` includes " +
        "`scripts/**/*.test.ts`, so an unmapped specifier there is the same defect as one in " +
        "`src/` — and a scan that never opens the directory reports it clean."
    ).toBeGreaterThan(0);
  });

  it("CONTROL: the scan reads the package's real source tree", () => {
    const { files } = scan();
    expect(
      files.length,
      "Far fewer files than this package holds. The walk is not reaching the tree, so an " +
        "empty result above would mean nothing."
    ).toBeGreaterThan(100);
  });

  it("CONTROL: the import reader ignores prose and keeps every import form", () => {
    // Every specifier is ASSEMBLED, never written whole: this file sits inside the
    // tree the scan walks. The reader skips string literals, so spelled out they
    // would be harmless today — but a reader that regressed to a regex would then
    // report this fixture as genuine imports and fail the invariant on its own test.
    const at = (name: string): string => `@nexus${"/"}${name}`;
    const doc = [
      `// import a from "${at("in-a-comment")}";`,
      `const s = 'import b from "${at("in-a-string")}"';`,
      `import type { C } from "${at("type-only")}";`,
      `export { d } from "${at("re-export")}";`,
      `const e = await import("${at("dynamic")}");`
    ].join("\n");
    expect(
      importsOf("fixture.ts", doc),
      "The import reader is reporting text inside a comment or a string as an import, or " +
        "missing a real import form. Either way the scan above is measuring the wrong text."
    ).toEqual([at("type-only"), at("re-export"), at("dynamic")]);
  });

  it("CONTROL: a regex literal does not make a later template literal read as code", () => {
    // 🔴 THE ARM ABOVE PASSES ON A TOKEN SCANNER, AND THIS ONE DOES NOT. Its fixture
    // holds a comment and a single-quoted string, both of which `ts.preProcessFile`
    // skips correctly — so for as long as the reader was that scanner, the arm above
    // was a true statement about two of the three things it appeared to cover.
    //
    // The third is template literals, and a token scanner does not recognise a regex
    // literal: the `"`, `'` and backtick below are read as string and template
    // delimiters, which desynchronises its tracking and makes a LATER template
    // literal's contents scan as code. Measured on typescript 6.0.3, this fixture
    // reports `at("in-a-template")` through `preProcessFile` and nothing through this
    // reader.
    //
    // 🔴 THE REGEX IS COPIED FROM THE SHAPE THAT DOES IT IN `apps/frontend`, AND THAT IS
    // NOT COSMETIC — WHETHER A GIVEN REGEX DESYNCHRONISES DEPENDS ON THE ARRANGEMENT OF
    // THOSE CHARACTERS, NOT ON THERE BEING A BACKTICK. Measured, same fixture otherwise:
    // this spelling leaks and `/["'`]/g` does NOT, because in the shorter one the
    // opening `"` runs a string over the backtick. Written with that spelling the arm
    // passes under BOTH readers and discriminates nothing.
    //
    // This package holds no such regex today, so the arm guards the reader rather than
    // a live leak: `apps/frontend` does hold one, and leaked four specifiers through it.
    const at = (name: string): string => `@nexus${"/"}${name}`;
    const flipped = [
      // The trigger, in the spelling measured to do it.
      `const QUOTED = /["'\`]([^"'\`]+)["'\`]/g`,
      `const t = \`import x from "${at("in-a-template")}"\``,
      // The POSITIVE twin, so this arm cannot be satisfied by a reader that reports
      // nothing at all: a real import AFTER the flip must still be reported.
      `import { Y } from "${at("after-the-flip")}";`
    ].join("\n");
    expect(
      importsOf("fixture.ts", flipped),
      "The import reader is reporting the contents of a template literal as an import. " +
        "That is the `ts.preProcessFile` desynchronisation, and it manufactures workspace " +
        "specifiers in whichever file holds a regex literal of this shape — a false " +
        "offender in exactly the circumstance this gate exists to fire in."
    ).toEqual([at("after-the-flip")]);
  });

  it("CONTROL: a load this scan cannot place is counted, not dropped", () => {
    // An exact set rather than a ceiling, so adding a computed load reds AND removing
    // one reds: a bound that only grows is satisfied by the act it exists to notice.
    expect(
      [...scan().computed].sort(),
      "A scanned file loads a module by a computed specifier that `COMPUTED_LOADS_ALLOWED` " +
        "does not name. `import(name)` names no module the scan can judge, so a workspace " +
        "entry loaded that way is invisible to the arm above. Confirm the new load cannot " +
        "name a workspace specifier, then add it there with that reason."
    ).toEqual([...COMPUTED_LOADS_ALLOWED].sort());
  });

  it("CONTROL: every alias points at a source file that exists", () => {
    const missing = Object.entries(WORKSPACE_SOURCE_ALIASES)
      .filter(([, source]) => !fs.existsSync(path.resolve(PKG, source)))
      .map(([specifier, source]) => `${specifier} -> ${source}`);

    expect(
      missing,
      "An alias names a path that is not on disk. Vite would fail to resolve the specifier " +
        "at run time."
    ).toEqual([]);
  });

  it("every alias targets the source file its package's `exports` map names", () => {
    const disagreements = Object.entries(WORKSPACE_SOURCE_ALIASES).flatMap(
      ([specifier, source]) => {
        const [name, subpath] = splitSpecifier(specifier);
        const dir = fs.realpathSync(path.join(PKG, "node_modules", name));
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")) as {
          exports?: Record<string, { default?: string } | undefined>;
        };
        const declared = manifest.exports?.[subpath]?.default;
        const expected = declared === undefined ? undefined : path.join(dir, declared);
        const actual = fs.existsSync(path.resolve(PKG, source))
          ? fs.realpathSync(path.resolve(PKG, source))
          : path.resolve(PKG, source);
        return actual === expected
          ? []
          : [
              `${specifier} -> ${source}, but ${name}'s exports["${subpath}"].default is ${declared}`
            ];
      }
    );
    expect(
      disagreements,
      "An alias maps a specifier to a different file than the one the package itself names " +
        "as that entry's source — so the suite reads a module no consumer ever gets."
    ).toEqual([]);
  });

  it.each(
    eachOrRefuse(
      Object.entries(WORKSPACE_SOURCE_ALIASES).filter(([specifier]) => IMPORTED.has(specifier)),
      "the aliased workspace specifiers this package imports"
    )
  )(
    "%s resolves, at run time, to the module its alias names",
    async (specifier, source) => {
      // `import()` with a non-literal specifier still goes through vitest's resolver,
      // so this is the alias as APPLIED by `vitest.config.ts`, not as written in the
      // table. Two resolutions of one file are one module instance; dist and source
      // are two, and their exports are not the same objects.
      const viaSpecifier = (await import(specifier)) as Record<string, unknown>;
      const viaSource = (await import(path.resolve(PKG, source))) as Record<string, unknown>;
      const names = Object.keys(viaSource).filter(
        (key) => typeof viaSource[key] === "object" || typeof viaSource[key] === "function"
      );
      expect(
        names.length,
        `${source} exports no object or function to compare by identity.`
      ).toBeGreaterThan(0);
      expect(
        names.filter((key) => viaSpecifier[key] !== viaSource[key]),
        `${specifier} loaded a DIFFERENT module from ${source} — the alias table names it, but ` +
          "vitest.config.ts is not applying that row, so the suite reads the build output."
      ).toEqual([]);
    },
    // `@nexus/types` and `@nexus/types/contracts` are barrels over hundreds of source
    // files, and loading one from SOURCE transforms every file it reaches — past
    // vitest's 5s default on a loaded machine, where a timeout would read as a
    // resolution failure. Bounded rather than infinite: a load that never finishes
    // must still fail.
    60_000
  );
});
