import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
 * DERIVED, NOT LISTED. `sourceAliasesFor` (`@nexus/config/lib/source-aliases.cjs`) reads
 * the table off every `workspace:` dependency's `exports` — `@agent-nexus/sdk`,
 * `@nexus/types` and `@nexus/vibe-app-vendoring` — through the derivation the backend's
 * jest resolver aliases from, so a new subpath is aliased the moment it is exported.
 * `src/workspace-imports-stay-aliased.test.ts` holds every workspace specifier this package
 * imports to that same derivation. Two more readers take the table as it is:
 * `scripts/test-runner/gate-specs-source-aliases.ts` rebases it for `Gate specs`, and
 * `scripts/v1-contract-projection.ts` checks its contract import against it.
 *
 * WHY THIS SITS AT THE PACKAGE ROOT, NOT IN `src/`. Every non-test file under `src/` counts
 * as SHIPPED to the mirror gate (`scripts/_lib/mirror-manifests.mjs`,
 * `isShippedSourceFile`), and this module imports `@nexus/config`, a devDependency the
 * public mirror strips. Here it is outside the bundle's tree and outside that gate's walk,
 * as `packages/sdk/vitest.aliases.ts` is. `package.json`'s `files` ships `dist` only, and
 * tsup's entry graph starts at `src/index.ts` and never reaches it.
 *
 * Values are ABSOLUTE paths; `vitest.config.ts`'s `path.resolve(__dirname, source)`
 * leaves them as they are.
 */
const { sourceAliasesFor }: typeof import("@nexus/config/lib/source-aliases.cjs") = createRequire(
  import.meta.url
)("@nexus/config/lib/source-aliases.cjs");

export const WORKSPACE_SOURCE_ALIASES: Readonly<Record<string, string>> = sourceAliasesFor(
  path.dirname(fileURLToPath(import.meta.url))
);
