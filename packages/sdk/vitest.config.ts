import { createRequire } from "node:module";

import { defineConfig } from "vitest/config";

import { WORKSPACE_SOURCE_ALIASES } from "./vitest.aliases";

const { anchoredAliasEntries }: typeof import("@nexus/config/lib/source-aliases.cjs") =
  createRequire(__filename)("@nexus/config/lib/source-aliases.cjs");

export default defineConfig({
  resolve: {
    alias: anchoredAliasEntries(WORKSPACE_SOURCE_ALIASES, __dirname)
  },
  test: {
    // Literal, not imported: this package is mirrored to NexusGPT/agent-nexus, which
    // carries no packages/config/test-runner/. The spec
    // test-runners-start-without-sparkplug.spec.ts pins it to `V8_WORKAROUND_FLAGS`
    // in packages/config/test-runner/v8-workaround.mjs.
    poolOptions: { forks: { execArgv: ["--no-sparkplug"] } },
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"]
  }
});
