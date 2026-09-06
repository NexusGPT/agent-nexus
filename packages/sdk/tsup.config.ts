import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  // TWO entries, and the second one is the whole point of the split.
  //
  // `v1-response-contract` is the published route manifest — the largest single
  // thing this package contains, read by one opt-in code path. As a second
  // entry it becomes its own file in `dist/`, reachable only through the
  // `./v1-response-contract` subpath in `exports`, so a consumer who never
  // writes that import never receives the bytes. Keyed rather than an array
  // because the key IS the emitted basename and the `exports` map names it.
  //
  // `splitting: false` below is what keeps this honest: each entry is bundled
  // whole and independently, so nothing of the manifest can be hoisted into a
  // shared chunk that `index.mjs` then pulls back in.
  entry: {
    index: "src/index.ts",
    "v1-response-contract": "src/v1-response-contract.ts"
  },
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
