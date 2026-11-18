import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * The modules allowed to import `@nexus/types`, DISCOVERED rather than listed.
 *
 * A drift gate must see the real contracts, so each `*.conformance.ts` imports
 * the types package; none of them is reachable from `src/index.ts`, which is
 * what keeps them out of the published bundle.
 *
 * Discovered, because this file previously named ONE module as a constant and
 * the second gate (`admin-wire-types.conformance.ts`) turned it red on arrival.
 * A hardcoded allowlist makes adding a gate look like breaking a rule, and the
 * cheapest way out of that is to widen the constant without thinking — which is
 * how an allowlist stops meaning anything. The rule is "a conformance module,
 * and nothing else"; the suffix IS the rule, so it is what gets matched.
 */
const CONFORMANCE_SUFFIX = ".conformance.ts";
/** A module of hand-declared wire shapes. Each one must have a gate beside it. */
const WIRE_TYPES_SUFFIX = "-wire-types.ts";

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
 * harness, which depends on `zod` alone and never on this package — so after
 * `types` the next character must be `/` or the quote, never `-`.
 *
 * The POSITION half is `(?:from|import|require)\s*\(?\s*`, and it is what
 * separates a LOAD from a MENTION. This file does not strip comments (see
 * `workspace-imports-stay-aliased.test.ts`, which strips them and explains why
 * the two guards must fail in opposite directions), and the package name appears
 * as a bare string in this file's own `devDependencies` assertions below. A
 * matcher on the specifier alone would report those as imports. The optional
 * `\(?` covers `import(...)` and `require(...)` alongside `from "..."` and a
 * side-effect `import "..."`; it is the same prefix the sibling guard in this
 * directory already uses, so the two cannot disagree about what counts as a load.
 */
const IMPORTS_NEXUS_TYPES = /\b(?:from|import|require)\s*\(?\s*["']@nexus\/types(?:\/[^"']*)?["']/;

/**
 * `@nexus/types` must not reach the published CLI.
 *
 * The package is a devDependency, added so the conformance modules can compare
 * the CLI's hand-declared wire shapes against the real contracts. That is safe
 * only while nothing the binary can reach imports it: `@nexus/types` pulls Zod
 * and the generated Prisma enums, which is the +5MB the CLI's standalone
 * publishing model exists to avoid.
 *
 * "It is only imported from a gate" is a property of today's tree, not a
 * property of the build — tsup bundles whatever `src/index.ts` reaches, and
 * nothing stops a future edit from reaching further. This is the assertion that
 * makes it a property of the build.
 *
 * The check is deliberately stricter than reachability: NO file outside a
 * conformance module may import it, reachable or not, AT ANY SUBPATH DEPTH. A
 * reachability walk would have to model re-exports, dynamic imports and
 * `import type` elision, and every one of those is a place for the walk to
 * under-report. Nothing else in this package has a legitimate reason to want
 * the import.
 *
 * 🔴 A STATED SCOPE THE MATCHER DOES NOT HOLD IS THE FAILURE THIS GATE HAS
 * ALREADY HAD. The matcher allowed ONE path segment while the rule above said
 * "no file outside a conformance module", so `@nexus/types/public-api-v1` was
 * caught and `@nexus/types/testing/each-or-refuse` was not — and 20 test files
 * under `src/` accumulated the deeper spelling, every one reading as compliant.
 * A deep import costs the same +5MB as a shallow one, so the hole was the whole
 * rule for anything two segments down. The matcher is unbounded in depth now,
 * and the two `the matcher reads …` arms below pin that: a gate whose model is
 * narrower than its rule cannot report the difference, so the model gets arms
 * of its own rather than being trusted because the sweep over the tree is green.
 */
describe("@nexus/types stays out of the published bundle", () => {
  const files = sourceFiles();
  const conformance = files.filter((f) => f.endsWith(CONFORMANCE_SUFFIX));
  const wireTypes = files.filter((f) => f.endsWith(WIRE_TYPES_SUFFIX));

  it("finds source files, and finds the gates", () => {
    // Guards the gates themselves. A moved `src/`, a broken walk, or either
    // suffix constant renamed would otherwise scan an empty list and report a
    // clean pass over nothing — every assertion below is VACUOUSLY TRUE over an
    // empty set, which is the worse half. One floor per discovered population,
    // because each is the only arm that can see its own set drain: `conformance`
    // for the import rules below, `wireTypes` for the pairing gate.
    expect(files.length).toBeGreaterThan(10);
    expect(conformance.length).toBeGreaterThan(0);
    expect(wireTypes.length).toBeGreaterThan(0);
  });

  /**
   * Every fixture below is ASSEMBLED, never written whole, and that is
   * load-bearing: this spec is a non-conformance file inside the very
   * population it judges, so a fixture spelling the specifier as one literal
   * would make this file an offender of its own gate. The same reason
   * `shims-gain-no-importers.spec.ts` assembles its old paths.
   */
  const PKG = `@nexus${"/"}types`;
  /**
   * A DIFFERENT package that this one's name is a prefix of — the dev-only test
   * harness, which depends on `zod` alone and never on `@nexus/types`, so
   * importing it ships nothing. The closing quote in the matcher is the only
   * thing that separates the two, which is why it gets arms rather than trust.
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
    // The floor is SECOND on purpose. A failing assertion aborts the rest of its
    // own block, so a count above these names would steal the kill from every
    // mutant that moves both — and a drained table satisfies the filter
    // vacuously, which is the one thing the floor is here to catch.
    expect(LOADS.filter((line) => !IMPORTS_NEXUS_TYPES.test(line))).toEqual([]);
    expect(LOADS.length).toBe(8);
  });

  it("the matcher reads neither a sibling package nor a bare mention as a load", () => {
    expect(NOT_LOADS.filter((line) => IMPORTS_NEXUS_TYPES.test(line))).toEqual([]);
    expect(NOT_LOADS.length).toBe(4);
  });

  /**
   * Every hand-mirrored wire module has a gate, DERIVED rather than listed.
   *
   * The suffix discovery above settles which modules MAY import `@nexus/types`.
   * It says nothing about whether a gate still exists, so deleting one left this
   * suite green, typecheck quiet, and the drift check gone with no CI signal.
   *
   * Two names used to be pinned here by hand, which covered exactly the two
   * gates that existed when the line was written and silently exempted the
   * third. Pairing `<name>-wire-types.ts` with `<name>-wire-types.conformance.ts`
   * costs nothing to add a gate — the requirement appears with the module it
   * guards — and cannot be satisfied by deleting one.
   *
   * The expected name is DERIVED, never rebuilt. It used to be spelled
   * `` `-wire-types${CONFORMANCE_SUFFIX}` ``, which restates `WIRE_TYPES_SUFFIX`
   * minus its extension: one rule with two declarations that can be edited apart.
   * Rename the convention and discovery follows the constant while the expectation
   * stays pinned to the old spelling, so the gate reports on a rule nobody
   * declared — failing correctly-named files, or passing over a stale pair. Every
   * discovered module already ENDS in `WIRE_TYPES_SUFFIX`, and `sourceFiles`
   * collects nothing but `.ts`, so swapping that trailing extension for
   * `CONFORMANCE_SUFFIX` yields the required gate name whatever either constant
   * says. `$` is load-bearing: `String.replace` with a string pattern takes the
   * FIRST occurrence anywhere in the path, and these are paths.
   */
  it("every wire-types module has a conformance module beside it", () => {
    const ungated = wireTypes
      .map((f) => f.replace(/\.ts$/, CONFORMANCE_SUFFIX))
      .filter((expected) => !conformance.includes(expected));

    expect(
      ungated,
      `these wire-type modules declare hand-mirrored shapes with nothing checking them: ${ungated.join(", ")}`
    ).toEqual([]);
  });

  it("is imported only by conformance modules", () => {
    const offenders = files.filter(
      (file) =>
        !file.endsWith(CONFORMANCE_SUFFIX) &&
        IMPORTS_NEXUS_TYPES.test(readFileSync(join(SRC_DIR, file), "utf-8"))
    );
    expect(offenders).toEqual([]);
  });

  it("is a devDependency, never a runtime one", () => {
    // The import restriction above is only half of it. A runtime dependency
    // ships in the published `package.json` and is installed beside the binary
    // whether or not any code imports it.
    const pkg = JSON.parse(readFileSync(join(SRC_DIR, "..", "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("@nexus/types");
    expect(Object.keys(pkg.devDependencies ?? {})).toContain("@nexus/types");
  });

  it("every conformance module still imports it, which is the point", () => {
    // Without this, deleting a gate's import would satisfy every assertion above
    // while removing that gate entirely — the file would still be there, still
    // named `.conformance.ts`, and comparing nothing.
    for (const file of conformance) {
      expect(readFileSync(join(SRC_DIR, file), "utf-8")).toMatch(IMPORTS_NEXUS_TYPES);
    }
  });
});
