import { defineConfig } from "tsup";

const isWatch = process.argv.includes("--watch");

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: false,
  splitting: false,
  clean: true,
  target: "es2020",
  outDir: "dist",
  external: isWatch ? ["@agent-nexus/sdk"] : [],
  noExternal: isWatch ? [] : ["@agent-nexus/sdk"],
  silent: true,
  async onSuccess() {
    const fs = await import("node:fs");
    const shebang = "#!/usr/bin/env node\n";
    const file = "dist/index.js";
    try {
      const content = fs.readFileSync(file, "utf-8");
      if (!content.startsWith("#!")) {
        fs.writeFileSync(file, shebang + content);
      }
    } catch {}
  }
});
