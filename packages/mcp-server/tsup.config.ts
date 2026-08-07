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
    // Add the shebang to the CLI entrypoints after the build.
    //
    // `package.json`'s `bin.nexus-mcp` points at dist/cli.js, so a file that
    // never receives its shebang is published as a binary the shell cannot
    // execute. This step therefore must not fail quietly, and it used to: the
    // body was wrapped in `try { … } catch {}`, which swallowed a failed
    // WRITE just as readily as a missing file.
    //
    // Absence is the one condition that is genuinely expected — dropping a
    // format from `format` above stops emitting its file — so it is tested for
    // explicitly. Every other error is a real build failure and is left to
    // throw, which fails `prepublishOnly` instead of releasing a broken CLI.
    const fs = await import("node:fs");
    const shebang = "#!/usr/bin/env node\n";
    for (const file of ["dist/cli.js", "dist/cli.mjs"]) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, "utf-8");
      if (!content.startsWith("#!")) {
        fs.writeFileSync(file, shebang + content);
      }
    }
  }
});
