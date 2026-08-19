import path from "node:path";

import { defineConfig } from "vitest/config";

import { WORKSPACE_SOURCE_ALIASES } from "./src/vitest.aliases";

export default defineConfig({
  // Each `find` is ANCHORED (`^…$`) so it matches the bare specifier and never a
  // subpath. A plain-string alias in Vite is a PREFIX match, which would rewrite
  // `@nexus/types/server` into `<types>/src/index.ts/server` — a path that does
  // not exist — instead of leaving it unmapped for the guard spec to catch.
  resolve: {
    alias: Object.entries(WORKSPACE_SOURCE_ALIASES).map(([specifier, source]) => ({
      find: new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      replacement: path.resolve(__dirname, source)
    }))
  },
  test: {
    environment: "node",
    // BOTH TREES, ONE RUNNER. `test/` used to be a SECOND runner — the package's
    // `test` script was `vitest run && tsx --test test/unit/*.test.ts`, so the
    // obvious command (`vitest run`) executed the whole `src/` tree and silently
    // skipped the 114 assertions in `test/` that hold the `--help` truth ledger
    // and the contract-blocked ledger. A half-suite is worse than no suite: it
    // reports PASSED over the ratchets it never read. Keep every test glob this
    // package owns in this one list, so `pnpm test` and a bare `vitest run` can
    // never diverge again.
    //
    // `scripts/typecheck-guards.ts` (`orphanTestFileViolations`) reads this array
    // and reports any test file no glob here reaches, which is what stops a new
    // directory going invisible the way `test/unit` did.
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // `test/unit/help-truth.test.ts` and `descriptor-match.test.ts` build the
    // WHOLE command tree and scan every leaf's `--help` in a `beforeAll`, which
    // runs for tens of seconds. Under `tsx --test` that was free: node:test
    // defaults to no timeout. vitest defaults to 5s for both a test and a hook,
    // so the migration would have turned a slow gate into a failing one. The
    // ceiling is deliberate rather than infinite — a scan that stops terminating
    // must still fail rather than hang a CI job forever.
    testTimeout: 120_000,
    hookTimeout: 180_000
  }
});
