import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/stdio.ts", "src/cli.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  clean: true,
  target: "es2020",
  outDir: "dist",
  skipNodeModulesBundle: true,
  silent: true,
  banner: ({ format }) => {
    // Inject shebang for CLI entrypoints in CJS format
    if (format === "cjs") {
      return { js: "" };
    }
    return {};
  },
  async onSuccess() {
    // Add shebang to CLI entrypoints after build
    const fs = await import("node:fs");
    const shebang = "#!/usr/bin/env node\n";
    for (const file of ["dist/cli.js", "dist/cli.mjs"]) {
      try {
        const content = fs.readFileSync(file, "utf-8");
        if (!content.startsWith("#!")) {
          fs.writeFileSync(file, shebang + content);
        }
      } catch {}
    }
  }
});
