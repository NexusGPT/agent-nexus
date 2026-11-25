import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Workspace specifiers this package's vitest suite must resolve to SOURCE, as
 * the `resolve.alias` entries `vitest.config.ts` installs.
 *
 * WHY THIS FILE EXISTS. `@agent-nexus/sdk` is a `workspace:*` devDependency,
 * bundled into the bridge for its region table, and every condition of its
 * `exports` map points at `./dist/`. `turbo.json` declares no `test` task, so
 * nothing orders an SDK build before this suite: an ABSENT `dist` fails loudly,
 * a STALE one goes green against a table that no longer exists. The alias is
 * local to this package's test run and changes nothing that is built or
 * published. `packages/cli/vitest.aliases.ts` carries the measurement.
 *
 * DERIVED, NOT LISTED — `sourceAliasesFor` (`@nexus/config/lib/source-aliases.cjs`)
 * reads the table off each `workspace:` dependency's `exports`.
 *
 * 🔴 UNLIKE ITS SIBLINGS, THIS ONE MUST LOAD WITHOUT `@nexus/config`. The public
 * mirror strips that devDependency, and the mirror's `release-mcp-server.yml`
 * RUNS THIS SUITE before it publishes — the CLI's and the SDK's release
 * workflows do not run theirs, which is why their copies may require it
 * unconditionally. There the SDK has just been built (`pnpm --filter
 * "@agent-nexus/mcp-server..." build` builds dependencies first), so resolving
 * it through `dist/` is correct, and no alias is the right answer. Only a
 * missing `@nexus/config` itself is tolerated; any other failure is rethrown.
 *
 * At the package root, not in `src/`, so nothing here reaches the build.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

type SourceAliasesModule = typeof import("@nexus/config/lib/source-aliases.cjs");
type AliasEntries = ReturnType<SourceAliasesModule["anchoredAliasEntries"]>;

function loadSourceAliases(): SourceAliasesModule | undefined {
  try {
    return createRequire(import.meta.url)("@nexus/config/lib/source-aliases.cjs");
  } catch (error) {
    const missingConfig =
      error instanceof Error &&
      "code" in error &&
      error.code === "MODULE_NOT_FOUND" &&
      error.message.includes("@nexus/config");
    if (missingConfig) return undefined;
    throw error;
  }
}

const SOURCE_ALIASES = loadSourceAliases();

/** The anchored `resolve.alias` entries, or none outside the monorepo. */
export const WORKSPACE_SOURCE_ALIAS_ENTRIES: AliasEntries = SOURCE_ALIASES
  ? SOURCE_ALIASES.anchoredAliasEntries(SOURCE_ALIASES.sourceAliasesFor(HERE), HERE)
  : [];
