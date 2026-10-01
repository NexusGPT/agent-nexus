import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * This package's scripts that a spec runs as a CHILD PROCESS under Node's own
 * type stripping — never through `tsx`. The reasoning and the measurement live in
 * `scripts/type-stripping/type-stripped-script.ts`, the repository's launcher;
 * the resolve hook both launchers load is beside it.
 *
 * This file builds the same argv rather than importing that launcher because
 * `tsconfig.json` compiles `src` with `rootDir: "src"`, so an import of the
 * repository's `scripts/` from here is TS6059. Each launcher's argv is proven by
 * the specs that spawn through it.
 *
 * `tsconfig.strip.json` typechecks exactly {@link TYPE_STRIPPED_SCRIPTS} and the
 * resolve hook with `erasableSyntaxOnly`, and `type-stripped-script.test.ts`
 * refuses the two lists disagreeing.
 */

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The shared resolve hook, relative to this package's root. */
export const RESOLVE_HOOK = "../../scripts/type-stripping/resolve-extensionless.hook.ts";

/** Every script a spec runs this way, relative to the package root. */
export const TYPE_STRIPPED_SCRIPTS = [
  "scripts/generate-cli-docs.ts",
  "scripts/id-thread-sweep.ts"
] as const;

export type TypeStrippedScript = (typeof TYPE_STRIPPED_SCRIPTS)[number];

/**
 * The argv that runs `script` under `process.execPath` — the Node running this
 * suite, so the version is the one the specs were launched with rather than
 * whatever `node` a PATH lookup finds.
 */
export function typeStrippedScriptArgv(script: TypeStrippedScript): string[] {
  if (!process.features.typescript) {
    throw new Error(
      `node ${process.version} cannot strip TypeScript types, so it cannot run ${script} ` +
        `without a loader. Use the version in .nvmrc.`
    );
  }
  return [
    // Silences the once-per-module "re-parsed as ESM" warning, so stderr carries
    // only what the script writes — the specs assert on it.
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--import",
    pathToFileURL(join(PACKAGE_ROOT, RESOLVE_HOOK)).href,
    join(PACKAGE_ROOT, script)
  ];
}
