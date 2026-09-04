import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: ["src/index.ts", "src/stdio.ts", "src/cli.ts"],
  format: ["cjs", "esm"],
  // Off: `tsc -p tsconfig.build.json` emits the declarations instead, and the
  // `build` script owns that second half. tsup's dts program sets `baseUrl` on
  // its own program whatever the package config says
  // (tsup/dist/rollup.js: `baseUrl: compilerOptions.baseUrl || "."`), and
  // `baseUrl` raises TS5101 under TypeScript 6 and is removed in 7, so a dts
  // build here cannot compile clean without silencing a diagnostic.
  dts: false,
  splitting: false,
  // Never clean during watch. `clean` deletes dist/ — including the declarations
  // tsc now owns, which tsup would not regenerate. Unlike the sibling packages,
  // `dev` here does NOT pass --onSuccess: a CLI --onSuccess REPLACES the
  // config's own, and the config's own is what puts the shebang on dist/cli.js.
  // Losing that would leave `bin.nexus-mcp` pointing at a file the shell cannot
  // execute, which is the exact failure the onSuccess block below exists to
  // prevent. Declarations therefore go stale during a watch; nothing in this
  // repo imports this package's types, and a full build regenerates them.
  clean: !options.watch,
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
}));
