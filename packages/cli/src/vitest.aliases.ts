/**
 * Workspace specifiers this package's vitest suite must resolve to SOURCE.
 *
 * WHY THIS FILE EXISTS. A vitest suite consuming a workspace package resolves it
 * through that package's `exports` map. `@agent-nexus/sdk`'s map has three
 * conditions — `types`, `import`, `require` — and every one of them points at
 * `./dist/`. `turbo.json` declares `build` and `typecheck` with
 * `dependsOn: ["^build"]`, so those two orders the SDK build first; it declares
 * NO `test` task at all, and `packages/cli` has no `pretest`. So nothing orders
 * that build before the tests, and the suite's green is only ever as fresh as
 * the last build anyone happened to run.
 *
 * An ABSENT `dist` fails loudly. A STALE one goes green against a contract that
 * no longer exists — measured on this package before this file existed: a symbol
 * added to `packages/sdk/src/index.ts` and not rebuilt was `undefined` to the
 * suite, which passed.
 *
 * WHY AN ALIAS RATHER THAN THE `exports` MAP. `@agent-nexus/sdk` is published to
 * npm and its `files` array ships `dist/**` only. A `source` condition pointing
 * at `./src/index.ts` would resolve to a path absent from the published tarball
 * for any consumer whose bundler honours that condition. The alias is local to
 * this package's test run, overrides resolution before the `exports` map is
 * consulted, and changes nothing about what is published.
 *
 * THE LIST IS THE WHOLE GUARANTEE. An alias maps only the specifiers it names,
 * so a single import of `@nexus/types/server` would silently reacquire the
 * defect — `tsc` resolves it happily, ESLint has no opinion, the suite goes
 * green. `src/workspace-imports-stay-aliased.test.ts` asserts every workspace
 * specifier in this package is a key below, which is what stops that.
 *
 * That specifier is named WITHOUT the `from "…"` form deliberately.
 * `src/wire-types-bundle.test.ts` keeps `@nexus/types` out of the PUBLISHED
 * bundle by scanning this directory for exactly that shape, and it does not
 * strip comments — correctly, because for a bundle-safety gate a false positive
 * costs a reword while a false negative ships the package to every user. Reword
 * prose here; never loosen that gate to accommodate it.
 *
 * `@nexus/types` and `@nexus/types/public-api-v1` are mapped even though no
 * `.test.ts` imports them today. They are imported by production sources the
 * suite can reach transitively, and a test added tomorrow must not have to
 * rediscover this.
 *
 * WHY THIS SITS IN `src/` while every sibling package keeps it at the package
 * root. This package's `tsconfig.json` sets `rootDir: "src"` and, unlike
 * `packages/shared`, does NOT exclude `src/**\/*.test.ts` from typecheck — so the
 * guard spec is a real part of the `tsc` program and cannot import a file above
 * `src/` (`TS6059`). Excluding the specs instead would be the wrong trade:
 * vitest transpiles per file without running the type graph, so `tsc` is the
 * only thing in this package that sees a type error inside a spec.
 *
 * The paths below stay relative to the PACKAGE ROOT, because `vitest.config.ts`
 * resolves them against its own `__dirname`. Nothing bundles this file — tsup's
 * entry graph starts at `src/index.ts` and never reaches it, and `package.json`'s
 * `files` array ships `dist` only.
 */
export const WORKSPACE_SOURCE_ALIASES: Record<string, string> = {
  "@agent-nexus/sdk": "../sdk/src/index.ts",
  "@agent-nexus/sdk/v1-response-contract": "../sdk/src/v1-response-contract.ts",
  "@nexus/types": "../types/src/index.ts",
  "@nexus/types/core": "../types/src/core/index.ts",
  "@nexus/types/domain": "../types/src/shared/domain/index.ts",
  "@nexus/types/public-api-v1": "../types/src/api/public/v1/index.ts",
  "@nexus/types/testing/each-or-refuse": "../types/src/testing/each-or-refuse.ts",
  "@nexus/types/testing/shrink-only-ledger": "../types/src/testing/shrink-only-ledger.ts"
};
