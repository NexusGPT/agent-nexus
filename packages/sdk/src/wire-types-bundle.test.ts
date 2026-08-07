import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * A module that can never reach the published package.
 *
 * Two independent reasons, and both have to hold: a `.test.ts` / `.conformance.ts`
 * is not in `tsup`'s entry graph (which starts at `src/index.ts`), and it is not
 * matched by `package.json`'s `files: ["dist"]`. Anything else in `src/` is a
 * candidate for the bundle.
 *
 * Matched by SUFFIX rather than by an allowlist of filenames. A hardcoded list
 * makes ADDING a gate look like breaking a rule, and the cheapest way out of
 * that is to widen the constant without thinking — which is how an allowlist
 * stops meaning anything.
 */
const UNPUBLISHABLE = [".test.ts", ".conformance.ts"];
const isUnpublishable = (file: string) => UNPUBLISHABLE.some((s) => file.endsWith(s));

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
 * property of the build — tsup bundles whatever `src/index.ts` reaches, and
 * nothing stops a future edit from reaching further. This is the assertion that
 * makes it a property of the build.
 *
 * Mirrors `packages/cli/src/wire-types-bundle.test.ts`, which guards the same
 * boundary in the other mirrored package for the same reason.
 */
describe("@nexus/types stays out of the published bundle", () => {
  const files = sourceFiles();
  const importers = files.filter((f) =>
    IMPORTS_NEXUS_TYPES.test(readFileSync(join(SRC_DIR, f), "utf-8"))
  );

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

  it("is imported only from modules that cannot be published", () => {
    // Deliberately stricter than reachability: no publishable file may import
    // it, reachable from the entry point or not. A reachability walk would have
    // to model re-exports, dynamic imports and `import type` elision, and every
    // one of those is a place for the walk to under-report. Nothing else in this
    // package has a legitimate reason to want the import.
    expect(importers.filter((f) => !isUnpublishable(f))).toEqual([]);
  });

  it("no importer is reachable from the package entry point", () => {
    // The assertion above says WHICH files may carry the import. This one says
    // the entry point cannot pull one in anyway: a stray
    // `export * from "./types/…-match-the-v1-contract.test"` would ship the whole
    // of `@nexus/types` to every consumer while every other check here stayed
    // green.
    const entry = readFileSync(join(SRC_DIR, "index.ts"), "utf-8");
    const reachable = importers.filter((f) => entry.includes(`./${f.replace(/\.ts$/, "")}`));
    expect(reachable).toEqual([]);
  });

  it("is a devDependency, never a runtime one", () => {
    // The import restriction is only half of it. A runtime dependency ships in
    // the published `package.json` and is installed beside the library whether
    // or not any code imports it.
    const pkg = JSON.parse(readFileSync(join(SRC_DIR, "..", "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("@nexus/types");
    expect(Object.keys(pkg.devDependencies ?? {})).toContain("@nexus/types");
  });
});
