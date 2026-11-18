import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  type DeclaredEntry,
  declaredEntryPoints,
  defaultBundleName,
  packageExports
} from "./entry-roster.conformance";

/**
 * The main entry must not reach the generated route manifest.
 *
 * ## Why a graph walk and not a byte check on `dist/`
 *
 * The saving this file protects is real and measured — moving
 * `V1_RESPONSE_CONTRACT` off the default path took `dist/index.mjs` from
 * 419,924 raw / 86,246 gzipped to the figures in this PR's description — but the
 * thing that produces it is a property of the SOURCE: `src/index.ts` reaches no
 * module that imports `./response-contract.generated`. Break that property with
 * one import and every consumer pays again.
 *
 * A spec asserting over `dist/` would have to skip when the package has not been
 * built, and a skipped arm is indistinguishable from a passing one — the same
 * reasoning `scripts/assert-declarations.mjs` gives for being a build step
 * rather than a test. This asks the question the build can only answer
 * downstream of, and needs nothing on disk but the sources.
 *
 * ## The over-approximation is deliberate, and it is the safe direction
 *
 * Every `from "…"` specifier is followed, `import type` included. A type-only
 * import emits nothing, so treating it as an edge makes the reachable set LARGER
 * than what a bundler actually walks. That is the direction to buy: a
 * `not.toContain` verdict over a set that is too big is strictly stronger than
 * one over a set that is too small, and it is a set that is too small — a
 * matcher that quietly stopped following a shape of import — that would hand
 * back a clean result for a package that ships the table anyway.
 *
 * Which is why the anti-vacuity arms below are not decoration. A walker that
 * matched nothing would return `{index}` and pass the headline assertion. The
 * controls require the closure to be large, to hold the transport, and to hold
 * the checker the transport uses — and a second walk from a non-default entry
 * has to reach the manifest, or the entry ships nothing and the feature is
 * simply gone rather than moved.
 *
 * ## ONE authority, and the other two ASSERTED against it
 *
 * The subpath entry's identity is three different facts that read as the same
 * string: a module FILENAME under `src/`, an `exports` map KEY in
 * `package.json`, and a KEY-plus-PATH row in `tsup.config.ts`. Written as three
 * literals, each one pins a real fact and nothing connects them. Derived from
 * all three, the arms would be a tautology wearing a derivation's clothes.
 *
 * So `tsup.config.ts` is the single authority — it is the only thing that
 * decides what gets BUNDLED, which is the subject of this whole file — and the
 * other two are asserted to agree with it:
 *
 * | the fact | here |
 * |---|---|
 * | the tsup entry KEY and PATH | DERIVED, via `declaredEntryPoints()`. Never asserted against itself. |
 * | the module filename under `src/` | ASSERTED — the path tsup declares must be on disk, and the graph walk starts there |
 * | the `exports` map key | ASSERTED — `./<entry key>` must be a published subpath whose every condition target names `dist/<entry key>.…` |
 *
 * Moving any ONE of the three out of agreement reds an arm here: a renamed
 * entry key loses its `exports` subpath, a repointed entry path loses its
 * module or stops reaching the manifest, a renamed module file is no longer on
 * disk, and a moved `exports` key is no longer found. Deleting the entry row
 * outright drains the roster, which the floor arm refuses; deleting the whole
 * `entry` map is `declaredEntryPoints()`'s own refusal.
 *
 * This also closes a hole the literals could not: a THIRD entry landing in
 * `tsup.config.ts` is walked and cross-checked the moment it is declared,
 * rather than publishing a bundle no arm in this file ever looked at.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url));

/** Every relative specifier in `text`, whatever import form carries it. */
function relativeSpecifiers(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    // import … from "./x" · export … from "./x" · import type … from "./x"
    /(?<![.\w$])from\s*["'](\.[^"'\n]*)["']/g,
    // import("./x")
    /(?<![.\w$])import\s*\(\s*["'](\.[^"'\n]*)["']/g,
    // require("./x")
    /(?<![.\w$])require\s*\(\s*["'](\.[^"'\n]*)["']/g,
    // bare side-effect import
    /(?:^|[;{}])\s*import\s*["'](\.[^"'\n]*)["']/gm
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** `spec` resolved against `fromFile`, as a path relative to `src/`. */
function resolveModule(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return path.relative(SRC, candidate);
  }
  return null;
}

/** Every module reachable from `entry`, transitively, relative to `src/`. */
function closureFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const rel = queue.pop() as string;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = path.join(SRC, rel);
    for (const spec of relativeSpecifiers(fs.readFileSync(abs, "utf8"))) {
      const next = resolveModule(abs, spec);
      if (next !== null && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

const MANIFEST_MODULE = "response-contract.generated.ts";

/** The roster `tsup.config.ts` declares, with each entry's graph already asked. */
interface EntryRoster {
  /** Every entry tsup declares, in declaration order. */
  readonly entries: readonly DeclaredEntry[];
  /** The one a consumer reaches by importing this package BY NAME. */
  readonly defaultEntry: DeclaredEntry;
  /** Those whose module graph reaches the generated manifest. */
  readonly reachingManifest: readonly DeclaredEntry[];
}

/**
 * Resolve the roster and walk every entry's graph.
 *
 * Called per arm rather than once at `describe` scope, deliberately: each
 * refusal below — and `declaredEntryPoints()`'s two — is a finding this file
 * exists to report, and a throw at `describe` scope is a suite that fails to
 * LOAD, which every runner reports with a non-zero exit and ZERO executed
 * tests. A refusal has to arrive as a named failing arm, or the count that says
 * whether anything ran reads the same as a crash.
 *
 * @throws if `package.json`'s `"."` names a bundle tsup does not build, or if a
 *   declared entry's module is not on disk. Both make the questions below
 *   unanswerable rather than answerable-and-false.
 */
function roster(): EntryRoster {
  const entries = declaredEntryPoints();

  // Which entry is the DEFAULT is not this file's to assume. `exports["."]` IS
  // the definition of what an import BY NAME resolves, so the bundle that
  // subpath names is the default entry — and asking rather than hardcoding
  // `index` is what makes the arms below hold if that ever changes.
  const defaultName = defaultBundleName();
  const defaultEntry = entries.find((e) => e.name === defaultName);
  if (defaultEntry === undefined) {
    throw new Error(
      `package.json publishes "." as bundle ${JSON.stringify(defaultName)}, and tsup declares ` +
        `no entry of that name — only ${JSON.stringify(entries.map((e) => e.name))}. Which ` +
        "module a consumer reaches by importing this package by name is then unanswerable, and " +
        "every arm here is about that module."
    );
  }

  const absent = entries.filter((e) => !fs.existsSync(path.join(SRC, e.module)));
  if (absent.length > 0) {
    throw new Error(
      `tsup declares entries whose modules are not on disk: ${absent
        .map((e) => `${e.name} -> ${e.declaredPath}`)
        .join(", ")}. The graph walks below would read a path that is not there, so this ` +
        "refuses naming the config row rather than throwing ENOENT at a resolved path."
    );
  }

  return {
    entries,
    defaultEntry,
    reachingManifest: entries.filter((e) => closureFrom(e.module).has(MANIFEST_MODULE))
  };
}

describe("the default entry does not carry the v1 route manifest", () => {
  it("walks a real graph — the controls that make the verdicts below mean anything", () => {
    // A matcher that stopped matching returns {the entry} and passes the
    // headline assertion silently. These three are what separate "the manifest
    // is unreachable" from "the walker read nothing".
    const fromDefault = closureFrom(roster().defaultEntry.module);
    expect(fromDefault.size).toBeGreaterThan(50);
    expect(fromDefault).toContain("http-client.ts");
    expect(fromDefault).toContain("response-contract.ts");
  });

  it("never reaches the generated manifest", () => {
    // The whole PR, in one assertion. `response-contract.ts` — the checker — is
    // small and stays on the default path; `response-contract.generated.ts` —
    // the table of every route the API publishes — is the caller's to supply.
    expect(closureFrom(roster().defaultEntry.module)).not.toContain(MANIFEST_MODULE);
  });

  it("ships the manifest behind exactly the entries that are not the default", () => {
    // The other half, and stated as an EQUALITY rather than as a presence, so
    // it reds from both sides: the manifest appearing on the default path adds
    // a name to the left, and a non-default bundle that stopped carrying it —
    // the feature DELETED rather than moved — removes one.
    const { entries, defaultEntry, reachingManifest } = roster();
    const names = (list: readonly DeclaredEntry[]) => list.map((e) => e.name).sort();

    expect(names(reachingManifest)).toEqual(names(entries.filter((e) => e !== defaultEntry)));
  });

  it("declares more than the default entry, so the equality above is not vacuous", () => {
    // Its own block rather than a floor under the arm above, because both sides
    // of that equality drain together when the entry row is deleted — two empty
    // lists are equal, and a failing arm aborts the rest of its own block, so a
    // floor placed there would be unreachable under exactly the mutant it is
    // for. Nothing else in this file notices a drained roster.
    expect(roster().entries.length).toBeGreaterThan(1);
  });

  it("declares every entry in both places a consumer resolves through", () => {
    const { entries, defaultEntry } = roster();
    const exports_ = packageExports();

    for (const entry of entries) {
      // The subpath a consumer writes. `"."` for the default — that is what
      // being the default MEANS — and its own key for every other entry.
      const subpath = entry === defaultEntry ? "." : `./${entry.name}`;
      const conditions = exports_[subpath];

      // For the default row this is satisfied by the derivation, since
      // `defaultBundleName()` read `exports["."]` to find it. For every other
      // entry it is the real cross-check: a renamed tsup key looks for a
      // subpath `package.json` does not publish.
      expect(conditions, `tsup entry ${entry.declaredPath} -> exports[${subpath}]`).toBeDefined();

      for (const [condition, target] of Object.entries(conditions ?? {})) {
        // The SHAPE, never the file: `dist/` is absent in a clean checkout —
        // `Gate specs` installs with `--ignore-scripts` — and asserting
        // existence only where it happens to be built is an arm that is strong
        // in one environment and silent in the other. `assert-declarations.mjs`
        // owns existence: it reads this same `exports` map after the build and
        // refuses any named file that is not emitted.
        //
        // DERIVED from the entry key, which `tsup.config.ts` states IS the
        // emitted basename — so this is the arm that reds when a condition
        // target names some other bundle, the default row included.
        expect(
          target.startsWith(`./dist/${entry.name}.`),
          `exports[${subpath}].${condition} = ${target} — must name the bundle tsup emits ` +
            `for entry ${JSON.stringify(entry.name)}`
        ).toBe(true);
      }
    }

    // The floor comes SECOND: a roster that read nothing iterates zero times
    // and every assertion above is vacuously true over it. Placed first it
    // would steal the kill from every mutant that moves a target string.
    expect(entries.length).toBeGreaterThan(1);
  });
});
