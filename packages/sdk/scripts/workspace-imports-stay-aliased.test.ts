/**
 * The alias in `vitest.config.ts` maps only the specifiers `vitest.aliases.ts`
 * NAMES. A workspace specifier this package imports that is absent from that list
 * resolves through `@nexus/types`'s `exports` map instead, whose `node` condition
 * points at `dist/` — so the suite reads whatever was last built.
 *
 * Nothing else notices that. `tsc` resolves the same specifier to source (it does
 * not match `node` under `moduleResolution: "bundler"`), ESLint has no opinion,
 * and the suite goes green against a stale contract. So this spec is the only
 * thing standing between one new import line and a silent return to reading a
 * stale build.
 *
 * Imports are read with `ts.preProcessFile`, the compiler's own import scanner,
 * rather than a regex: it skips comments, string literals and template literals
 * by construction, so prose that quotes an import line is never an import, and it
 * still reports `import type`, `export … from`, `import()` and `require()`.
 *
 * Each control is its OWN `it`, deliberately. Folded into one block, a broken scan
 * would satisfy the invariant vacuously (an empty set is a subset of anything) and
 * the control meant to catch that would never be evaluated.
 */
import fs from "node:fs";
import path from "node:path";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { WORKSPACE_SOURCE_ALIASES } from "../vitest.aliases";

const PKG = path.resolve(__dirname, "..");

/** Every tree `vitest.config.ts`'s `include` reaches, and so every tree an alias must cover. */
const SCANNED_TREES = ["src", "scripts"].map((tree) => path.join(PKG, tree));

const WORKSPACE_SCOPE = /^@(nexus|agent-nexus)\//;

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full.endsWith(".ts") ? [full] : [];
  });

const importsOf = (source: string): string[] =>
  ts.preProcessFile(source, true, true).importedFiles.map((ref) => ref.fileName);

const scan = (): { files: string[]; specifiers: Map<string, string[]> } => {
  const files = SCANNED_TREES.flatMap(walk);
  const specifiers = new Map<string, string[]>();
  for (const file of files) {
    for (const specifier of importsOf(fs.readFileSync(file, "utf-8"))) {
      if (!WORKSPACE_SCOPE.test(specifier)) continue;
      const seen = specifiers.get(specifier) ?? [];
      seen.push(path.relative(PKG, file));
      specifiers.set(specifier, seen);
    }
  }
  return { files, specifiers };
};

/** `@nexus/types/testing/x` → `["@nexus/types", "./testing/x"]`. */
const splitSpecifier = (specifier: string): [string, string] => {
  const [scope, name, ...rest] = specifier.split("/");
  return [`${scope}/${name}`, rest.length === 0 ? "." : `./${rest.join("/")}`];
};

/**
 * The workspace specifiers this package imports. The runtime arm below loads only these:
 * the table is derived from every dependency's `exports`, so it also carries entries this
 * package never imports — `@nexus/types/server` and the node-only `testing/*` harness
 * among them — and loading one of those here would test an import that is never made.
 */
const IMPORTED = new Set(scan().specifiers.keys());

describe("workspace imports stay aliased to source", () => {
  it("maps every workspace specifier this package imports", () => {
    const { specifiers } = scan();
    const unmapped = [...specifiers.entries()]
      .filter(([specifier]) => !(specifier in WORKSPACE_SOURCE_ALIASES))
      .map(([specifier, files]) => `${specifier} (imported by ${files.join(", ")})`);

    expect(
      unmapped,
      "These specifiers resolve through the dependency's `exports` map, whose `node` " +
        "condition points at `dist/`, so this suite would test against whatever was last " +
        "built rather than against source. The table is derived from each dependency's " +
        "`exports`, so an unmapped entry is one whose `default` names no source file that " +
        "exists. REMEDY: give it one. Do not delete " +
        "this assertion — an unmapped specifier is the defect it exists to catch."
    ).toEqual([]);
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
      importsOf(doc),
      "The import reader is reporting text inside a comment or a string as an import, or " +
        "missing a real import form. Either way the scan above is measuring the wrong text."
    ).toEqual([at("type-only"), at("re-export"), at("dynamic")]);
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
