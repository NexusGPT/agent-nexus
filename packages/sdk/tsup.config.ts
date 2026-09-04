import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  // Off: `tsc -p tsconfig.build.json` emits the declarations instead, and the
  // `build` script owns that second half. tsup's dts program sets `baseUrl` on
  // its own program whatever the package config says
  // (tsup/dist/rollup.js: `baseUrl: compilerOptions.baseUrl || "."`), and
  // `baseUrl` raises TS5101 under TypeScript 6 and is removed in 7, so a dts
  // build here cannot compile clean without silencing a diagnostic.
  dts: false,
  sourcemap: false,
  splitting: false,
  // Never clean during watch. `clean` deletes dist/ — including the declarations
  // tsc now owns, which tsup would not regenerate; `dev` regenerates them via
  // --onSuccess. Full builds still clean.
  clean: !options.watch,
  target: "es2020",
  outDir: "dist",
  skipNodeModulesBundle: true,
  silent: true
}));
