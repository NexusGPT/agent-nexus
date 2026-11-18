import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "@nexus/config/lib/strip-comments.mjs";
import { describe, expect, it } from "vitest";

import { declaredEntryPoints, publishedBundleNames } from "./entry-roster.conformance";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * A module that can never reach the published package.
 *
 * Two independent reasons, and both have to hold: a `.test.ts` / `.conformance.ts`
 * is in no entry graph `tsup.config.ts` declares — the arms below DERIVE that
 * entry list rather than restating it — and `package.json`'s `files` publishes
 * built output alone: the `.js`, `.mjs` and `.d.ts` files under `dist/`, plus
 * `README.md` and `LICENSE`. No `.ts` under `src/` is shipped as a file in its
 * own right. Anything else in `src/` is a candidate for the bundle.
 *
 * Matched by SUFFIX rather than by an allowlist of filenames. A hardcoded list
 * makes ADDING a gate look like breaking a rule, and the cheapest way out of
 * that is to widen the constant without thinking — which is how an allowlist
 * stops meaning anything.
 */
const UNPUBLISHABLE = [".test.ts", ".conformance.ts"];
const isUnpublishable = (file: string) => UNPUBLISHABLE.some((s) => file.endsWith(s));

const PKG_DIR = join(SRC_DIR, "..");

/**
 * Every spelling of the specifier `from` would use to load `target`, both
 * relative to `src/`.
 *
 * Quoted on BOTH sides deliberately, and it is the same distinction
 * `IMPORTS_NEXUS_TYPES` draws between a LOAD and a MENTION one scale down.
 * These docblocks cite sibling module paths in prose constantly, and a citation
 * is not an edge — the convention here is a backticked path, which no quoted
 * needle matches. The closing quote also stops `./x` matching `./xy`.
 */
function loadSpellings(from: string, target: string): string[] {
  const rel = relative(dirname(from), target);
  const base = rel.startsWith(".") ? rel : `./${rel}`;
  return [base.replace(/\.ts$/, ""), base].flatMap((p) => [`"${p}"`, `'${p}'`]);
}

/** Every `.ts` file under `src/`, relative to it. */
function sourceFiles(dir = SRC_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(relative(SRC_DIR, full));
  }
  return out;
}

/**
 * A LOAD of `@nexus/types`, at ANY subpath depth and in every loader shape.
 *
 * Two halves, and both are load-bearing.
 *
 * The SPECIFIER half is `@nexus/types` followed by `(?:\/[^"']*)?` and then the
 * closing quote. Depth is unbounded on purpose: the package publishes subpaths
 * four segments deep (`@nexus/types/schemas/Deployment/deploymentSettings/
 * WhatsApp/__json.schema`), and a deep import drags in exactly the Zod and
 * generated Prisma enums a shallow one does. A matcher allowing ONE segment
 * reads every deeper import as compliant, which is a gate whose stated rule is
 * broader than what it enforces. The closing quote is what keeps
 * `@nexus/types-testing` out: that is a different package — the dev-only test
 * harness, which depends on `zod` alone and never on this package, and which
 * this package declares as a devDependency of its own — so after `types` the
 * next character must be `/` or the quote, never `-`.
 *
 * The POSITION half is `(?:from|import|require)\s*\(?\s*`, and it is what
 * separates a LOAD from a MENTION. This file does not strip comments, and the
 * package name appears as a bare string in its own `devDependencies`
 * assertions below. A matcher on the specifier alone would report those as
 * imports — this file would then be its own importer. The optional `\(?`
 * covers `import(...)` and `require(...)` alongside `from "..."` and a
 * side-effect `import "..."`.
 *
 * Mirrors the matcher in `packages/cli/src/wire-types-bundle.test.ts`, so the
 * two guards cannot disagree about what counts as a load.
 */
const IMPORTS_NEXUS_TYPES = /\b(?:from|import|require)\s*\(?\s*["']@nexus\/types(?:\/[^"']*)?["']/;

/**
 * `@nexus/types` must not reach the published SDK.
 *
 * The package is a devDependency, added so the v1 contract gates under
 * `types/*.test.ts` can compare this SDK's hand-written wire shapes against the
 * schemas the server validates its own responses against. That is safe only
 * while nothing the LIBRARY can reach imports it: `@nexus/types` pulls Zod and
 * the generated Prisma enums, which is the weight this package's standalone
 * publishing model exists to avoid — and a consumer installing
 * `@agent-nexus/sdk` from npm has no `@nexus/types` to resolve at all, so a
 * leaked import would be a broken `.d.ts` rather than merely a fat one.
 *
 * "It is only imported from a gate" is a property of today's tree, not a
 * property of the build — tsup bundles whatever each of its declared entry
 * points reaches, and nothing stops a future edit from reaching further. These
 * are the assertions that make it a property of the build.
 *
 * Mirrors `packages/cli/src/wire-types-bundle.test.ts`, which guards the same
 * boundary in the other mirrored package for the same reason.
 *
 * ── What this file does NOT cover, and what does ───────────────────────────
 *
 * This is a claim about SOURCE. `UNPUBLISHABLE` also happens to match the
 * `exclude` list in `tsconfig.build.json`, and nothing keeps those two in step —
 * a third suffix added here leaves this spec green while the declaration build
 * emits a `.d.ts` naming `@nexus/types`. `scripts/assert-published-imports.mjs`,
 * wired into the `build` script, covers the emitted output directly, so adding a
 * suffix here needs no matching edit anywhere: the build says whether the
 * published declarations still resolve.
 */
describe("@nexus/types stays out of the published bundle", () => {
  const files = sourceFiles();

  /**
   * Every source's CODE, read once: comments blanked, literal text and every
   * offset kept.
   *
   * One projection for all three readers below, through the same shared state
   * machine the entry parser uses. Both questions this file asks are textual —
   * does a module LOAD `@nexus/types`, and does a publishable module REFERENCE
   * an unpublishable one — and a textual scan over raw source answers both
   * about prose. These docblocks discuss `@nexus/types` and cite sibling spec
   * paths constantly, so the file most careful about the hazard is the one most
   * likely to be read as practising it.
   *
   * Literal text is KEPT, and that is required rather than incidental: the
   * `devDependencies` assertions near the foot of this file name the package
   * inside a string, and the matcher's POSITION half is what keeps those from
   * counting as loads. Blanking literals would instead blind the reference
   * reader, whose whole subject is a quoted specifier.
   */
  const CODE: ReadonlyMap<string, string> = new Map(
    files.map((f) => [f, stripComments(readFileSync(join(SRC_DIR, f), "utf-8"))])
  );

  const importers = [...CODE]
    .filter(([, code]) => IMPORTS_NEXUS_TYPES.test(code))
    .map(([file]) => file);
  const publishable = files.filter((f) => !isUnpublishable(f));
  const unpublishable = files.filter(isUnpublishable);

  it("read the source tree", () => {
    // Guards the gate itself. A moved `src/` or a broken walk would otherwise
    // scan an empty list, and every assertion below is VACUOUSLY TRUE over an
    // empty set — which is the worse half of the failure.
    expect(files.length).toBeGreaterThan(10);
  });

  it("something does import it, so the restriction below is not vacuous", () => {
    // Without this, deleting every gate would satisfy the restriction perfectly
    // while removing the whole mechanism, and nothing would say so.
    expect(importers.length).toBeGreaterThan(0);
  });

  /**
   * Every fixture below is ASSEMBLED, never written whole, and that is
   * load-bearing for a reason specific to this file: `importers` is computed
   * over `files`, which includes THIS file. A fixture spelling the specifier
   * as one literal would make this spec count as an importer of itself — and
   * the `not vacuous` arm directly above would then be satisfied by this
   * file's own fixtures, over a tree in which every real importer had been
   * deleted. That is the exact vacuity the arm exists to refuse.
   */
  const PKG = `@nexus${"/"}types`;
  /**
   * A DIFFERENT package that this one's name is a prefix of — the dev-only
   * test harness, which depends on `zod` alone and never on `@nexus/types`, so
   * importing it ships nothing. This package declares it as a devDependency,
   * so a direct import of it is one edit away rather than hypothetical. The
   * closing quote in the matcher is the only thing separating the two, which
   * is why it gets an arm rather than trust.
   */
  const HARNESS = `${PKG}-testing`;

  /** Loads of this package. Every one must be CAUGHT, whatever its depth or shape. */
  const LOADS: readonly string[] = [
    `import { A } from "${PKG}";`,
    `import type { A } from "${PKG}/public-api-v1";`,
    `import { eachOrRefuse } from "${PKG}/testing/each-or-refuse";`,
    `import { S } from "${PKG}/schemas/Deployment/deploymentSettings/WhatsApp/__json.schema";`,
    `export * from "${PKG}/core";`,
    `import "${PKG}/domain";`,
    `const m = await import("${PKG}");`,
    `const e = require("${PKG}/db-enum");`
  ];

  /** Not loads of this package. Every one must be MISSED, or the gate cries wolf. */
  const NOT_LOADS: readonly string[] = [
    `import { eachOrRefuse } from "${HARNESS}/each-or-refuse";`,
    `const t = require("${HARNESS}/tracked-files");`,
    `expect(Object.keys(pkg.devDependencies)).toContain("${PKG}");`,
    `expect(names).toEqual(["@agent-nexus/sdk", "${PKG}"]);`
  ];

  it("the matcher reads a load of this package at any subpath depth", () => {
    // The floor is SECOND on purpose. A failing assertion aborts the rest of
    // its own block, so a count above these names would steal the kill from
    // every mutant that moves both — and a drained table satisfies the filter
    // vacuously, which is the one thing the floor is here to catch.
    expect(LOADS.filter((line) => !IMPORTS_NEXUS_TYPES.test(line))).toEqual([]);
    expect(LOADS.length).toBe(8);
  });

  it("the matcher reads neither a sibling package nor a bare mention as a load", () => {
    expect(NOT_LOADS.filter((line) => IMPORTS_NEXUS_TYPES.test(line))).toEqual([]);
    expect(NOT_LOADS.length).toBe(4);
  });

  it("is imported only from modules that cannot be published", () => {
    // Deliberately stricter than reachability: no publishable file may import
    // it, reachable from the entry point or not. A reachability walk would have
    // to model re-exports, dynamic imports and `import type` elision, and every
    // one of those is a place for the walk to under-report. Nothing else in this
    // package has a legitimate reason to want the import.
    expect(importers.filter((f) => !isUnpublishable(f))).toEqual([]);
  });

  it("no publishable module references one that cannot be published", () => {
    // The assertion above says WHICH files may carry the import. This one says
    // no entry can pull one in anyway: a stray
    // `export * from "./types/…-match-the-v1-contract.test"` would ship the whole
    // of `@nexus/types` to a consumer while every other check here stayed green.
    //
    // Quantified over every publishable module rather than over the entries,
    // and that is what makes it hold at ANY DEPTH without walking a graph. Take
    // any chain from an entry to an unpublishable module: walk it to the first
    // unpublishable hop, and the edge INTO that hop starts at a publishable
    // module. So forbidding that one edge everywhere forbids the whole chain,
    // and `./resources/index.ts` re-exporting its own
    // `v1-route-scan.conformance` — the shape this package is one line away
    // from, since that helper sits inside the barrel's directory — is caught
    // from the same arm as a stray re-export in `index.ts` itself.
    //
    // The arm below is what connects this to the entries: it is only a
    // statement about what tsup BUNDLES while every entry is itself publishable.
    const leaks = [...CODE]
      .filter(([from]) => !isUnpublishable(from))
      .flatMap(([from, code]) =>
        unpublishable
          .filter((target) => loadSpellings(from, target).some((s) => code.includes(s)))
          .map((target) => `${from} -> ${target}`)
      );
    expect(leaks).toEqual([]);

    // The floors come SECOND, for the reason the matcher arms above give: a
    // failing assertion aborts the rest of its block, so a count placed first
    // would steal the kill from every mutant that moves both. Either side
    // empty makes the filter vacuously true over zero pairs.
    expect(publishable.length).toBeGreaterThan(10);
    expect(unpublishable.length).toBeGreaterThan(0);
  });

  it("every entry point tsup declares is itself a publishable module", () => {
    // What the arm above is quantified over is PUBLISHABLE modules, so it
    // covers the entries only while the entries are among them. An entry
    // pointed at a `.test.ts` would be bundled and shipped without a single
    // assertion in this file firing — the arm above skips it as unpublishable,
    // and the one before it permits the import precisely because it is.
    const entries = declaredEntryPoints();

    // Reported as the config row rather than the resolved module, so a failure
    // names the line to edit instead of a path the reader has to map back.
    expect(entries.filter((e) => isUnpublishable(e.module)).map((e) => e.declaredPath)).toEqual([]);
    // A typo'd entry path is not a leak, but it does mean the name above was
    // checked against a file that is not there.
    expect(
      entries.filter((e) => !existsSync(join(SRC_DIR, e.module))).map((e) => e.declaredPath)
    ).toEqual([]);

    // The floor, and it is a second authority rather than a number: `exports`
    // is hand-written and always carries at least `.`, so a derivation that
    // read nothing cannot satisfy this. It also catches the two halves drifting
    // apart in either direction — an entry built and never published, or a
    // subpath published and never built.
    expect(entries.map((e) => e.name).sort()).toEqual(publishedBundleNames());
  });

  it("is a devDependency, never a runtime one", () => {
    // The import restriction is only half of it. A runtime dependency ships in
    // the published `package.json` and is installed beside the library whether
    // or not any code imports it.
    const pkg = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("@nexus/types");
    expect(Object.keys(pkg.devDependencies ?? {})).toContain("@nexus/types");
  });
});
