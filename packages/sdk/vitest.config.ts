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
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"]
  }
});
