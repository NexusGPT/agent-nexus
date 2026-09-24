import { defineConfig } from "tsup";

/**
 * 🔴 THIS PACKAGE HAS NO RUNTIME DEPENDENCIES, AND THAT IS THE WHOLE REASON IT
 * EXISTS RATHER THAN LIVING IN `@nexus/types`.
 *
 * Both consumers need the same rewrites, but one of them is `@agent-nexus/cli`,
 * which is published standalone and bundles everything it imports
 * (`external: []` in its own tsup config). Importing `@nexus/types` there pulls
 * Zod and the generated Prisma enums into the published binary — the +5MB the
 * CLI's publishing model exists to avoid — and
 * `packages/cli/src/wire-types-bundle.test.ts` refuses that import outright, for
 * any file that is not a conformance gate.
 *
 * So the validation here is hand-written type guards rather than Zod. That is a
 * deliberate trade and not a lowering of the bar: these are narrow, local JSON
 * shapes read off a file on disk, not an HTTP boundary, and
 * `core/code-quality.md` names a type guard as the correct instrument when the
 * alternative is a cast. Adding ANY runtime dependency to this package puts the
 * weight back into the CLI, so the dependency list staying empty is load-bearing.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  // Off: `tsc -p tsconfig.build.json` emits the declarations instead. tsup's dts
  // program sets `baseUrl` on its own program whatever the package config says,
  // and `baseUrl` raises TS5101 under TypeScript 6 and is removed in 7 — the
  // same reason `vibe-stack-detect` splits its build in two.
  dts: false,
  splitting: false,
  clean: true,
  target: "es2020",
  outDir: "dist",
  silent: true
});
