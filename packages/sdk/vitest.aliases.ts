/**
 * Workspace specifiers this package's vitest suite must resolve to SOURCE.
 *
 * WHY THIS FILE EXISTS. `@nexus/types` is a `workspace:*` devDependency, and its
 * `exports` map puts a `node` condition — `types`, `import`, `require`, every one
 * of them under `./dist/` — ahead of the `default` that names `./src/`. vitest
 * resolves with the `node` condition, so without this table every spec here that
 * reads the v1 contract AT RUNTIME reads whatever `packages/types/dist` was last
 * built: the route scan behind `v1-routes-have-an-sdk-method.test.ts` and the
 * response-type gate, the ledgers they reconcile, and `eachOrRefuse` /
 * `shrinkOnlyLedger` themselves. `turbo.json` declares no `test` task, so nothing
 * orders a `@nexus/types` build before this suite. A route added to the contract
 * and not yet rebuilt was invisible to that scan, which passed.
 *
 * `tsc` was never part of the defect: under `moduleResolution: "bundler"` it does
 * not match the `node` condition and falls through to `default`, which is source.
 * The type-level half of the contract gates was always reading the current
 * contract; the runtime half was not, and the two halves of one file could
 * disagree about which contract they were checking.
 *
 * WHY AN ALIAS RATHER THAN THE `exports` MAP. `@nexus/types` is a dependency of
 * the backend and of every app; reordering its conditions changes resolution for
 * all of them. The alias is local to this package's test run and changes nothing
 * that is built or published.
 *
 * THE LIST IS THE WHOLE GUARANTEE. An alias maps only the specifiers it names, so
 * one new import of an unmapped `@nexus/types` subpath silently reacquires the
 * defect — `tsc` resolves it happily, ESLint has no opinion, the suite goes green.
 * `scripts/workspace-imports-stay-aliased.test.ts` asserts every workspace
 * specifier this package imports is a key below, and that each key resolves, at
 * run time, to the very module its target names.
 *
 * WHY THIS SITS AT THE PACKAGE ROOT, and the guard in `scripts/`, when
 * `packages/cli` keeps both in `src/`. Anything in this package's `src/` that is
 * not a `.test.ts` or a `.conformance.ts` is emitted by `tsc -p
 * tsconfig.build.json` into `dist/` — the published tarball — and is classified
 * as PUBLISHABLE by the version-bump gate (`scripts/_lib/published-surface.mjs`),
 * so a test-only table there would ship a `.d.ts` to npm and oblige a release.
 * Here it reaches neither: `files` ships `dist` only, and tsup's entries never
 * import it. `tsconfig.json`'s `rootDir: "src"` forbids a spec in `src/` from
 * importing it (`TS6059`), which is why the guard lives in `scripts/`, whose
 * `tsconfig.scripts.json` sets no `rootDir`.
 *
 * The public mirror (`NexusGPT/agent-nexus`) copies this whole directory, and
 * strips devDependencies, so no suite runs there and the `../types/` targets
 * below — absent from the mirror — are never resolved.
 *
 * The paths are relative to the PACKAGE ROOT, because `vitest.config.ts` resolves
 * them against its own `__dirname`.
 */
export const WORKSPACE_SOURCE_ALIASES: Record<string, string> = {
  "@nexus/types": "../types/src/index.ts",
  "@nexus/types/contracts": "../types/src/api/index.ts",
  "@nexus/types/public-api-v1": "../types/src/api/public/v1/index.ts",
  "@nexus/types/testing/each-or-refuse": "../types/src/testing/each-or-refuse.ts",
  "@nexus/types/testing/shrink-only-ledger": "../types/src/testing/shrink-only-ledger.ts"
};
