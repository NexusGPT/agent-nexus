import { defineConfig } from "vitest/config";

export default defineConfig({
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
