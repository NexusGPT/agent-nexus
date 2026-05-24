import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: false,
  splitting: false,
  clean: true,
  target: "es2020",
  outDir: "dist",
  skipNodeModulesBundle: true,
  silent: true
});
