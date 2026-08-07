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

const IMPORTS_NEXUS_TYPES =
  /\bfrom\s+["']@nexus\/types(?:\/[\w-]+)?["']|\brequire\(\s*["']@nexus\/types/;

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
 * conformance module may import it, reachable or not. A reachability walk would
 * have to model re-exports, dynamic imports and `import type` elision, and every
 * one of those is a place for the walk to under-report. Nothing else in this
 * package has a legitimate reason to want the import.
 */
describe("@nexus/types stays out of the published bundle", () => {
  const files = sourceFiles();
  const conformance = files.filter((f) => f.endsWith(CONFORMANCE_SUFFIX));

  it("finds source files, and finds the gates", () => {
    // Guards the gate itself. A moved `src/`, a broken walk, or a renamed suffix
    // would otherwise scan an empty list and report a clean pass over nothing —
    // and the "only a conformance module may import it" assertion below is
    // VACUOUSLY TRUE when the set is empty, which is the worse half.
    expect(files.length).toBeGreaterThan(10);
    expect(conformance.length).toBeGreaterThan(0);
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
   */
  it("every wire-types module has a conformance module beside it", () => {
    const ungated = files
      .filter((f) => f.endsWith(WIRE_TYPES_SUFFIX))
      .map((f) => f.replace(WIRE_TYPES_SUFFIX, `-wire-types${CONFORMANCE_SUFFIX}`))
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
