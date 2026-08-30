import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getGlobalInstallCommand, type PackageManager } from "../../src/util/package-manager";

/**
 * The mechanics of packing, installing and running the REAL artifact.
 *
 * Split out of the spec because these are the operations, not the claims — and
 * because a helper that writes a developer's global prefix, or that quietly
 * installs a workspace directory instead of a tarball, is a hazard worth
 * reading in one place rather than inline among assertions.
 *
 * Nothing here holds state or builds anything. The build is the spec's, on
 * purpose: it must happen exactly once per run, and a module-level build here
 * would fire once per importing worker.
 */

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));

/** `packages/cli` — the package root, from `test/install/`. */
export const PACKAGE_ROOT = join(HARNESS_DIR, "..", "..");

const MANIFEST = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
  name: string;
  version: string;
};

/** The version this checkout would publish. */
export const DECLARED_VERSION = MANIFEST.version;

/**
 * The published package name, read from the manifest rather than retyped.
 *
 * `upgrade.ts` keeps its own module-local `PACKAGE_NAME`. Reading the manifest
 * instead of importing it keeps this suite from needing a source change, and a
 * rename that reached one and not the other fails the substitution guard in
 * {@link shippedInstallCommand} rather than passing quietly.
 */
export const DECLARED_NAME = MANIFEST.name;

/**
 * Below every version this package has already published, used as the
 * "installed old copy" an upgrade has to move. Straddling the real version
 * rather than pinning it is how `upgrade-verifies-what-it-claims.test.ts` stays
 * true across releases; the same reasoning applies here.
 */
export const LONG_SUPERSEDED = "0.22.4";

/** Long enough for a pack of an ~11 MB tree plus a global install, on a loaded box. */
export const SLOW = 300_000;

/**
 * Every directory this run created, so none of them outlives it.
 *
 * A single pass installs the ~11 MB package into several prefixes and writes
 * several tarballs beside them. Left behind, one `pnpm test` leaks a few
 * hundred MB into `os.tmpdir()` and every later run leaks the same again —
 * which is how a suite that is correct becomes a suite people delete.
 * `test/e2e/README.md` makes the same argument for the API flows.
 */
const created: string[] = [];

export function tempDir(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `cli-install-${tag}-`));
  created.push(dir);
  return dir;
}

/**
 * Remove everything {@link tempDir} handed out.
 *
 * `force` so a directory already gone is not an error, and failures are
 * swallowed deliberately: a cleanup that throws would convert a leaked
 * temp directory into a failed suite, which reports the wrong problem.
 */
export function cleanupTempDirs(): void {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir === undefined) continue;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best effort. The OS reclaims `tmpdir()` regardless.
    }
  }
}

/**
 * The environment every spawned `nexus` gets.
 *
 * `HOME` is redirected so a spec can never read or write the developer's real
 * CLI config, and `NEXUS_NO_AUTO_UPDATE` is set for the reason
 * `resolve-on-path.ts` already documents: a CLI with auto-update armed could
 * start its own global install from inside a test that is itself installing.
 */
export function sealedEnv(home: string): NodeJS.ProcessEnv {
  return { ...process.env, HOME: home, NEXUS_NO_AUTO_UPDATE: "1", NO_COLOR: "1" };
}

export interface PackManifest {
  readonly name: string;
  readonly version: string;
  readonly filename: string;
  readonly entryCount: number;
  readonly files: readonly { readonly path: string }[];
}

/** `npm pack` for real — a `.tgz` on disk, not `--dry-run`'s manifest alone. */
export function pack(from: string, into: string): { tarball: string; manifest: PackManifest } {
  const stdout = execFileSync("npm", ["pack", "--json", "--pack-destination", into, from], {
    encoding: "utf8",
    // stderr is npm's notices; only stdout carries the JSON.
    stdio: ["ignore", "pipe", "pipe"]
  });
  const [manifest] = JSON.parse(stdout) as PackManifest[];
  if (manifest === undefined) {
    throw new Error(`npm pack --json returned no manifest. Raw output: ${stdout}`);
  }
  return { tarball: join(into, manifest.filename), manifest };
}

/**
 * An `argv[1]` that makes {@link detectPackageManager} answer a given manager.
 *
 * `detectPackageManager` takes no parameters — it reads `process.argv[1]` and
 * `fs.realpathSync` as globals — so driving it means setting that global.
 * `src/util/package-manager.test.ts` established exactly this idiom for exactly
 * this function; this reuses it rather than inventing a second one.
 */
export const MANAGER_LAYOUTS: Readonly<Record<PackageManager, string>> = {
  npm: "/usr/local/lib/node_modules/@agent-nexus/cli/dist/index.js",
  pnpm: "/Users/x/Library/pnpm/global/5/node_modules/@agent-nexus/cli/dist/index.js",
  yarn: "/Users/x/.yarn/bin/nexus"
};

/**
 * The command the SHIPPED builder produces, made safe to run — nothing else.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE VERB AND THE FLAGS COME FROM `getGlobalInstallCommand`, NOT FROM HERE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A user never runs a string a test invented; they run the one this function
 * builds. So the suite runs that one. If the builder emitted `npm update -g`
 * — the precise bug its own docblock exists to prevent, because an `update`
 * verb cannot cross a 0.x minor — every case here goes red, where a
 * hand-written command would have stayed green forever.
 *
 * Exactly two things are changed, and each is ASSERTED before it is changed so
 * a silent no-op substitution cannot quietly restore the hand-written shape:
 *
 *   · the registry spec becomes the local tarball. Installing
 *     `@agent-nexus/cli@latest` would fetch whatever the world currently holds
 *     and is the one thing this suite may never do.
 *   · `--prefix <tmp>` is APPENDED. The shipped command has no prefix concept —
 *     it installs into the real global root, which is the whole reason a spec
 *     may not run it unmodified.
 *
 * `--prefer-offline` rather than `--offline`: the tarball is a local file, but
 * `commander` is a declared runtime dependency and must genuinely resolve.
 * Preferring the cache keeps a warm machine fully offline and a cold one
 * correct, which is the honest ordering — a test that could not resolve a
 * declared dependency SHOULD fail, because a user's install would too.
 */
export function shippedInstallCommand(
  tarball: string,
  prefix: string,
  manager: PackageManager = "npm"
): string {
  const shipped = buildShippedCommand(manager);
  const spec = `${DECLARED_NAME}@latest`;

  if (!shipped.includes(spec)) {
    throw new Error(
      `The shipped install command no longer contains \`${spec}\`, so this ` +
        `substitution would be a silent no-op and the suite would install nothing. ` +
        `Command was: ${shipped}. Repair the substitution rather than relaxing it.`
    );
  }

  return `${shipped.replace(spec, tarball)} --prefix ${prefix} --prefer-offline --no-audit --no-fund`;
}

/**
 * `getGlobalInstallCommand` driven to one manager, with `argv[1]` restored.
 *
 * The restore is in a `finally` because `process.argv` is global to the worker:
 * leaking a pnpm-shaped path out of one case would silently change what every
 * later case in this file builds.
 */
export function buildShippedCommand(manager: PackageManager): string {
  const original = process.argv[1];
  try {
    process.argv[1] = MANAGER_LAYOUTS[manager];
    return getGlobalInstallCommand(DECLARED_NAME);
  } finally {
    process.argv[1] = original;
  }
}

/**
 * Install via the SHIPPED command. Every case in the suite goes through here,
 * so the verb and flags under test are the ones a user actually runs.
 */
export function installGlobally(
  tarball: string,
  prefix: string,
  manager: PackageManager = "npm"
): { status: number | null; stderr: string; command: string } {
  const command = shippedInstallCommand(tarball, prefix, manager);
  const result = spawnSync("sh", ["-c", command], { encoding: "utf8", timeout: SLOW });
  return { status: result.status, stderr: result.stderr ?? "", command };
}

/** The path a shell would run after a global install into `prefix`. */
export function installedBinary(prefix: string): string {
  return join(prefix, "bin", "nexus");
}

/** Where `npm install -g` unpacks the package itself. */
export function installedPackageRoot(prefix: string): string {
  return join(prefix, "lib", "node_modules", "@agent-nexus", "cli");
}

/** Run an installed binary and return what it printed. */
export function runInstalled(
  prefix: string,
  home: string,
  args: string[]
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(installedBinary(prefix), args, {
    encoding: "utf8",
    timeout: SLOW,
    env: sealedEnv(home)
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/**
 * A staging copy of exactly what `files` publishes, so a mutated variant can be
 * packed WITHOUT ever touching the real package on disk.
 *
 * 🚨 COPYING ONLY THE PUBLISHED SET IS THE POINT. `packages/cli` on disk carries
 * `src/` and a hoisted `node_modules` full of dependencies the manifest never
 * declares. Staging those would let a variant pass while accompanied by things
 * a user never receives — the exact false green this suite refuses.
 */
export function stagePublishedTree(mutate: (pkg: Record<string, unknown>) => void): string {
  const staged = tempDir("staged");
  const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  mutate(pkg);
  writeFileSync(join(staged, "package.json"), JSON.stringify(pkg, null, 2));

  for (const asset of ["COMPATIBILITY.md", "README.md"]) {
    const source = join(PACKAGE_ROOT, asset);
    if (existsSync(source)) cpSync(source, join(staged, asset));
  }
  mkdirSync(join(staged, "dist"), { recursive: true });
  cpSync(join(PACKAGE_ROOT, "dist"), join(staged, "dist"), { recursive: true });
  return staged;
}

/**
 * A staged tree that genuinely IS an older release — manifest and binary both.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE VERSION `nexus --version` PRINTS COMES FROM THE BUNDLE, NOT FROM THE
 *    INSTALLED `package.json`. Doctoring the manifest alone changes nothing.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `src/index.ts` reads `require("../package.json")`, and esbuild RESOLVES that
 * at build time: `dist/index.js` carries the whole manifest inlined as a
 * CommonJS module (`var require_package = __commonJS({ "package.json"(...) {
 * module2.exports = { name: "@agent-nexus/cli", version: "…" } } })`). The copy
 * on disk beside it is never read.
 *
 * Measured: a tarball whose `package.json` said `0.22.4`, installed cleanly,
 * still answered `0.35.1`. npm records the manifest version, so `npm ls` and the
 * binary can disagree. In the real pipeline they never do — the version is
 * bumped and THEN built — but a fixture that only rewrites the manifest is not
 * an older release, it is the current one wearing an older number.
 *
 * So the baked copy is rewritten too, and the substitution is COUNTED rather
 * than assumed: a silent no-op would hand back the current binary and every
 * "the upgrade moved it" assertion downstream would be measuring nothing.
 */
export function stageAtVersion(version: string): string {
  const staged = stagePublishedTree((pkg) => {
    pkg.version = version;
  });

  const bundle = join(staged, "dist", "index.js");
  const before = readFileSync(bundle, "utf8");
  const needle = `version: ${JSON.stringify(DECLARED_VERSION)}`;
  const occurrences = before.split(needle).length - 1;

  if (occurrences !== 1) {
    throw new Error(
      `Expected exactly one baked \`${needle}\` in dist/index.js, found ${occurrences}. ` +
        `The reported version is inlined by esbuild, so this fixture rewrites the bundle ` +
        `as well as the manifest. If the bundler's output shape changed, repair this ` +
        `substitution — do not relax the count, which is the only thing proving the ` +
        `fixture is a genuinely older binary.`
    );
  }

  writeFileSync(bundle, before.replace(needle, `version: ${JSON.stringify(version)}`));
  return staged;
}

/**
 * Ensure `dist/` exists, building it if it does not.
 *
 * `npm pack` does NOT build: `prepublishOnly` runs on publish only, and no
 * `prepack` is declared. So an unbuilt checkout packs a manifest with no binary
 * and every assertion fails for a reason it does not care about. CI runs this
 * suite on an unbuilt tree, so the build is PERFORMED rather than asserted, and
 * it is never skipped — a skip here is indistinguishable from the hole this
 * suite was written to close.
 */
export function ensureBuilt(): void {
  if (existsSync(join(PACKAGE_ROOT, "dist", "index.js"))) return;
  execFileSync("pnpm", ["run", "build"], { cwd: PACKAGE_ROOT, stdio: "inherit" });
}
