import path from "node:path";

import { defineConfig } from "vitest/config";

import { WORKSPACE_SOURCE_ALIASES } from "./vitest.aliases";

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
    // Literal, not imported: this package is mirrored to NexusGPT/agent-nexus, whose
    // root has no scripts/. test-runners-start-without-sparkplug.spec.ts pins it to
    // scripts/test-runner/v8-workaround.mjs.
    poolOptions: { forks: { execArgv: ["--no-sparkplug"] } },
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
    // `orphanTestFileViolations` (`scripts/typecheck-guards/orphan-test-files.ts`) reads this array
    // and reports any test file no glob here reaches, which is what stops a new
    // directory going invisible the way `test/unit` did.
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // THE REPOSITORY'S EVENT-LOOP STALL GUARD, the one the root config installs for
    // `scripts/__tests__`: a turn of the worker's loop before and after every test,
    // and a refusal for a test or hook that holds it past a third of vitest's 60s
    // worker-RPC timeout. Without it a file of synchronous cases never turns the
    // loop, its `onTaskUpdate` replies go unread, and the run ends `Timeout calling
    // "onTaskUpdate"` with every test passed and no file named — `main` post-merge
    // run 40474993876, from `src/exit-code-reachability.test.ts`. The guard's header
    // carries the mechanism; `test/unit/event-loop-stall-guard-is-installed.test.ts`
    // proves this line put it in the worker.
    //
    // A PATH, not an import, so this config still LOADS where `scripts/` is absent.
    // debt: the agent-nexus mirror ships no `scripts/test-runner/`, so a `vitest run`
    //       there fails at setup rather than running unguarded. Nothing there runs
    //       vitest today — its workflows are e2e shell flows, the sweep and releases.
    //       Upgrade trigger: the mirror starts running this suite; the guard then
    //       moves into `@nexus/config/test-runner/`, as the V8 workaround did.
    setupFiles: [
      path.resolve(__dirname, "../../scripts/test-runner/event-loop-stall-guard.setup.ts")
    ],
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
