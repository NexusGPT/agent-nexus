/**
 * A RE-EXPORT SHIM. The one comment-and-literal walk lives in `@nexus/config`, at
 * `packages/config/lib/strip-comments.mjs` — the lowest package every user of it can
 * declare without a cycle, so the frontend and `@nexus/types` reach it as a declared
 * dependency and nobody reaches it through `../../`. Every importer of this path keeps
 * working; the backend governance spec `shims-gain-no-importers.spec.ts` refuses a NEW
 * one and lets the count fall (its row is in `RE_EXPORT_SHIMS`).
 *
 * A RELATIVE re-export, never `@nexus/config/...`: the root scripts that import this
 * run under plain `node` in CI jobs and hooks, and the repository root declares no
 * workspace dependency. The public mirror carries both files, which is why
 * `MIRROR_ROOT_PATHS` in `.github/workflows/mirror-public-packages.yml` names both.
 */
export * from "../../packages/config/lib/strip-comments.mjs";
