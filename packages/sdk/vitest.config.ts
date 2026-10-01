import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Literal, not imported: this package is mirrored to NexusGPT/agent-nexus, whose
    // root has no scripts/. test-runners-start-without-sparkplug.spec.ts pins it to
    // scripts/test-runner/v8-workaround.mjs.
    poolOptions: { forks: { execArgv: ["--no-sparkplug"] } },
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"]
  }
});
