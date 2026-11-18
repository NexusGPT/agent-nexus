import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "@nexus/config/lib/strip-comments.mjs";

/**
 * The entry roster `tsup.config.ts` declares, read off that config itself.
 *
 * Shared by the two gates that both have to know what this package bundles:
 * `wire-types-bundle.test.ts` asks whether every entry is a module that may be
 * published, and `the-entry-bundle-carries-no-route-manifest.test.ts` asks which
 * entry each module graph hangs off. Two copies of this parser would be two
 * spellings of one question, and the drift between them would be silent in both
 * directions — a bundle one gate walks and the other does not is a bundle
 * neither gate is really watching.
 *
 * ## Why `.conformance.ts` rather than a plain module
 *
 * Anything in this package's `src/` that is not a `.test.ts` or a
 * `.conformance.ts` is emitted by `tsc -p tsconfig.build.json` into `dist/` —
 * the published tarball — so a test-only parser under a plain name would ship a
 * `.d.ts` to npm. The suffix is what makes that structural rather than a comment
 * promising nobody will import it: `tsconfig.build.json` excludes it from the
 * declaration program, `tsup`'s entries never reach it, and
 * `wire-types-bundle.test.ts` matches unpublishable modules by that same suffix,
 * so the arm forbidding a publishable module from referencing one covers this
 * file without naming it.
 *
 * It sits under `src/` rather than beside `tsup.config.ts` at the package root
 * because `tsconfig.json` sets `rootDir` to `src/`: a spec importing a module
 * above that root pulls it into the program from outside the root and the
 * compile fails. `vitest.aliases.ts` can live at the root precisely because
 * nothing in `src/` imports it.
 *
 * ## DERIVED, never restated
 *
 * The same reasoning as the `export *` in `index.ts` one directory up. A literal
 * list would be correct the day it was written and silently wrong the day a
 * third entry landed: that entry would publish a bundle no arm in either gate
 * had ever looked at, which is precisely the hole those arms exist to close. The
 * config is the only thing that decides what gets bundled, so it is the only
 * honest source for the question.
 *
 * Read as TEXT rather than imported, and that is FORCED rather than preferred:
 * `rootDir` is `src/`, so importing the config at the package root fails the
 * declaration program with TS6059 — measured, not assumed.
 *
 * ## A parser that misreads must REFUSE
 *
 * A text read of a config is a parser, and a parser that misreads must not
 * quietly return a short list — that is a gate ticking over a bundle it never
 * looked at. Both failure shapes below throw. Neither consumer may catch them:
 * the whole value of this module is that an unreadable config is a red arm
 * rather than an empty roster, and every assertion either gate makes about the
 * roster is vacuously true over an empty one.
 *
 * Belt and braces on top of that, in the consumers rather than here: both gates
 * floor the roster against `package.json`'s `exports`, which is hand-written and
 * always carries at least `.`, so a parse that read nothing cannot satisfy them.
 */

/** Where this module sits, and the package root above it. */
const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(SRC_DIR, "..");

/**
 * One row of `tsup.config.ts`'s `entry` map, in every form a gate needs.
 *
 * Three facts that READ as one string today and are not one fact: the entry's
 * NAME, which `tsup.config.ts` states is the emitted basename and the subpath
 * `exports` publishes; the PATH as tsup writes it, package-relative; and that
 * same module relative to `src/`, which is the form both gates' file-level
 * questions are asked in. Resolving the third here is what keeps the two gates
 * from each spelling the resolution out and disagreeing about it.
 */
export interface DeclaredEntry {
  /** The entry KEY — the emitted basename, and the subpath `exports` names. */
  readonly name: string;
  /** The entry VALUE, verbatim, package-relative — as `tsup.config.ts` writes it. */
  readonly declaredPath: string;
  /** The same module, relative to `src/`. */
  readonly module: string;
}

/**
 * Every entry point `tsup` builds, in declaration order.
 *
 * @throws if `tsup.config.ts` carries no `entry: { … }` object map, or carries a
 *   row this parser cannot classify. Both are findings, never rows to skip.
 */
export function declaredEntryPoints(): readonly DeclaredEntry[] {
  // Comments first: this config explains itself at length and its prose talks
  // about entries, so only the declaration may answer. Through the repo's
  // shared state machine rather than a pair of regexes here, and the reason is
  // the regexes' own failure mode: a comment opener INSIDE a string literal is
  // not a comment, so a character-level scan reads the `//` in a URL as a line
  // comment and the `/*` in a glob such as `"src/*"` as a block opener, then
  // blanks to the next closer anywhere in the file. `stripComments` is
  // string-aware and keeps literal text verbatim, which is exactly what this
  // parser needs — it reads the entry key and its path out of literals.
  const source = stripComments(readFileSync(join(PKG_DIR, "tsup.config.ts"), "utf-8"));

  const block = /\bentry\s*:\s*\{([^{}]*)\}/.exec(source);
  if (block === null) {
    throw new Error(
      "tsup.config.ts carries no `entry: { … }` map this file could read — it may have moved " +
        "to the array form or behind a variable. The arms that read this would otherwise pass " +
        "over an empty list, so this refuses rather than reporting a clean bill of health."
    );
  }

  const entries: DeclaredEntry[] = [];
  for (const row of block[1].split(",")) {
    if (row.trim() === "") continue;
    const parsed = /^\s*["']?([\w.-]+)["']?\s*:\s*["']([^"']+)["']\s*$/.exec(row);
    if (parsed === null) {
      throw new Error(
        `tsup.config.ts has an entry row this file cannot classify: ${JSON.stringify(row)}. ` +
          "An unreadable row is a finding, never a row to skip."
      );
    }
    entries.push({
      name: parsed[1],
      declaredPath: parsed[2],
      module: relative(SRC_DIR, resolve(PKG_DIR, parsed[2]))
    });
  }
  return entries;
}

/**
 * The emitted basename behind every subpath `package.json` publishes, sorted.
 *
 * The SECOND authority on the roster, and the reason a consumer can tell a
 * correct derivation from one that read nothing: `exports` is hand-written and
 * always carries at least `.`, so an empty or truncated entry map cannot match
 * it. `tsup.config.ts` states the invariant the two sides share — the entry key
 * IS the emitted basename, and the `exports` map names it.
 */
export function publishedBundleNames(): string[] {
  const names = new Set<string>();
  for (const conditions of Object.values(packageExports())) {
    const esm = conditions?.import;
    if (esm !== undefined) names.add(basenameOf(esm));
  }
  return [...names].sort();
}

/**
 * The emitted basename behind the `"."` subpath — the bundle an import of this
 * package BY NAME resolves to.
 *
 * This is what makes "the default entry" a question with an answer rather than a
 * hardcoded `index`: `exports["."]` IS the definition of what a bare
 * `import … from "@agent-nexus/sdk"` reaches, so the bundle it names is the
 * default entry by construction. A consumer of this function can then ask which
 * tsup entry that is, and get a wrong answer loudly rather than assume one.
 *
 * @throws if `exports` publishes no `"."`, or publishes one with no `import`
 *   condition. Every consumer of this is asking about the default path, so an
 *   unanswerable question must refuse rather than return a plausible string.
 */
export function defaultBundleName(): string {
  const root = packageExports()["."];
  const esm = root?.import;
  if (esm === undefined) {
    throw new Error(
      'package.json publishes no `exports["."]` with an `import` condition, so which bundle a ' +
        "consumer reaches by importing this package BY NAME is unreadable. The arms that read " +
        "this are all about that bundle, so this refuses rather than defaulting to a name."
    );
  }
  return basenameOf(esm);
}

/**
 * `package.json`'s `exports` map — subpath to its condition targets.
 *
 * Read here rather than in each consumer because the two gates ask DIFFERENT
 * questions of the same object and both need it whole: one reduces it to the set
 * of emitted basenames, the other reads each subpath's condition targets and
 * checks every one names the bundle its entry emits.
 *
 * Indexing yields `undefined` for an absent subpath — `Partial` rather than a
 * bare `Record`, because "this subpath is not published" is exactly the finding
 * a consumer is looking for and a type that denies it can happen turns the arm
 * that checks for it into dead code.
 */
export function packageExports(): Readonly<
  Partial<Record<string, Readonly<Record<string, string>>>>
> {
  const pkg = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf-8")) as {
    exports?: Record<string, Record<string, string>>;
  };
  return pkg.exports ?? {};
}

/** The emitted basename behind one `exports` target, e.g. `./dist/index.mjs` -> `index`. */
function basenameOf(target: string): string {
  return target.slice(target.lastIndexOf("/") + 1).replace(/\.mjs$/, "");
}
