import { defineConfig } from "vitest/config";

import { WORKSPACE_SOURCE_ALIAS_ENTRIES } from "./vitest.aliases";

export default defineConfig({
  // `@agent-nexus/sdk` resolves to SOURCE, never to its last build, and the
  // table degrades to empty in the public mirror — `vitest.aliases.ts` says why.
  resolve: {
    alias: WORKSPACE_SOURCE_ALIAS_ENTRIES
  },
  test: {
    // Literal, not imported: this package is mirrored to NexusGPT/agent-nexus, which
    // carries no packages/config/test-runner/. The spec
    // test-runners-start-without-sparkplug.spec.ts pins it to `V8_WORKAROUND_FLAGS`
    // in packages/config/test-runner/v8-workaround.mjs.
    poolOptions: { forks: { execArgv: ["--no-sparkplug"] } },
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
