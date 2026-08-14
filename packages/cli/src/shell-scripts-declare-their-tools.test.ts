/**
 * EVERY TOOL A SHELL SCRIPT UNDER `packages/cli/` RUNS MUST BE DECLARED BY THIS
 * PACKAGE — not by the workspace it happens to sit in.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS EXISTS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `pnpm exec <tool>` searches this package's `node_modules/.bin` AND then the
 * WORKSPACE ROOT's. So a tool the monorepo root declares resolves here, runs
 * green in every monorepo check, and is indistinguishable from a tool this
 * package owns.
 *
 * `packages/cli` is published out of a SECOND workspace — the public mirror
 * `NexusGPT/agent-nexus`, which `mirror-public-packages.yml` force-shapes to
 * hold the mirrored packages and a root manifest that declares NOTHING. There
 * the second search finds an empty directory.
 *
 * That is not a hypothesis. `scripts/sweep.sh` began calling `pnpm exec tsx`,
 * `tsx` was a devDependency of the monorepo ROOT and of no mirrored package, and
 * the mirror's `CLI Sweep` went red on the next sync and stayed red — while the
 * monorepo's own `CLI: Sweep`, running the same script against the same API,
 * stayed green. Nine consecutive runs, one npm release shipped underneath them.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS CAN AND CANNOT SEE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It reads the SHELL SCRIPTS this package ships, because those are what the
 * mirror's workflows invoke by path (`bash packages/cli/scripts/sweep.sh`,
 * `bash packages/cli/test/e2e/*.sh`) and they get no PATH help from anything.
 *
 * The `scripts` entries in `package.json` are checked under a WEAKER rule, and
 * deliberately: pnpm runs them with the workspace root's bin directory on PATH,
 * so leaning on a root devDependency is legitimate there — `lint` correctly uses
 * the root's `eslint`, which no mirror workflow ever runs. What is never
 * legitimate is a tool NOBODY declares, so the npm-script tier asks only that.
 *
 * It cannot see a system binary (`bash`, `curl`, `python3`, `node`) and does not
 * try to: those come from the runner image, not from a manifest.
 *
 * ⚠️ COMMENTS ARE NOT STRIPPED BEFORE SCANNING, and that is the deliberate
 * direction. A comment that quotes a `pnpm exec <tool>` line would be reported
 * as an undeclared tool — a false positive, costing a reword. Stripping them
 * risks over-stripping a real line and going silently green, which re-ships the
 * outage above. Loud beats silent on a guard whose failure mode is a red mirror
 * nobody is gating on.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(PKG_ROOT, "..", "..");

/** Directories under this package that hold shell scripts CI invokes by path. */
const SHELL_DIRS = ["scripts", join("test", "e2e")];

interface Manifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly bin?: string | Readonly<Record<string, string>>;
}

const readManifest = (path: string): Manifest =>
  JSON.parse(readFileSync(path, "utf8")) as Manifest;

const CLI_MANIFEST = readManifest(join(PKG_ROOT, "package.json"));
const ROOT_MANIFEST = readManifest(join(REPO_ROOT, "package.json"));

const declaredPackages = (manifest: Manifest): string[] => [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {})
];

/**
 * The executable names a set of declared packages actually provides.
 *
 * Resolved from each dependency's OWN `bin` field rather than assumed equal to
 * the package name, because they routinely differ: `typescript` provides `tsc`
 * and `tsserver`, `tsup` provides two. A name-equality shortcut would report
 * `tsc` as undeclared and `typescript` as unused in one stroke.
 *
 * A declared package with no directory on disk throws rather than being skipped:
 * "the dependency is not installed" and "the dependency provides no binary" are
 * different facts, and silently merging them is how this guard would go green on
 * an incomplete install.
 */
function binariesProvidedBy(manifest: Manifest, nodeModules: string): Set<string> {
  const binaries = new Set<string>();
  for (const name of declaredPackages(manifest)) {
    const manifestPath = join(nodeModules, name, "package.json");
    if (!existsSync(manifestPath)) {
      throw new Error(
        `${name} is declared but ${manifestPath} does not exist — run \`pnpm install\` before this spec.`
      );
    }
    const dependency = readManifest(manifestPath);
    if (typeof dependency.bin === "string") binaries.add(name.replace(/^@[^/]+\//, ""));
    else if (dependency.bin !== undefined) for (const key of Object.keys(dependency.bin)) binaries.add(key);
  }
  return binaries;
}

const CLI_BINARIES = binariesProvidedBy(CLI_MANIFEST, join(PKG_ROOT, "node_modules"));
const ROOT_BINARIES = binariesProvidedBy(ROOT_MANIFEST, join(REPO_ROOT, "node_modules"));

/** `pnpm exec <tool>` / `pnpm dlx <tool>` / `npx <tool>` — every form that reaches for a package binary. */
const PNPM_EXEC = /\b(?:pnpm\s+(?:exec|dlx)|npx)\s+(?:--?\S+\s+)*([A-Za-z0-9@._/-]+)/g;

interface Invocation {
  readonly tool: string;
  readonly source: string;
}

function shellInvocations(): Invocation[] {
  const found: Invocation[] = [];
  for (const dir of SHELL_DIRS) {
    const full = join(PKG_ROOT, dir);
    if (!existsSync(full)) continue;
    for (const file of readdirSync(full).filter((name) => name.endsWith(".sh"))) {
      const text = readFileSync(join(full, file), "utf8");
      for (const match of text.matchAll(PNPM_EXEC)) {
        found.push({ tool: match[1], source: join(dir, file) });
      }
    }
  }
  return found;
}

/**
 * The leading word of an npm script, per `&&`-separated clause.
 *
 * `pnpm` and `node` are excluded because they are the package manager and the
 * runtime — present by definition, declarable by nothing. That is the whole
 * carve-out, and both halves of it are structural rather than a judgement about
 * a particular tool.
 */
function scriptInvocations(): Invocation[] {
  const found: Invocation[] = [];
  for (const [name, body] of Object.entries(CLI_MANIFEST.scripts ?? {})) {
    for (const clause of body.split(/&&|\|\|/)) {
      const tool = clause.trim().split(/\s+/)[0];
      if (tool === undefined || tool === "") continue;
      if (tool === "pnpm" || tool === "node") continue;
      found.push({ tool, source: `package.json scripts.${name}` });
    }
  }
  return found;
}

const SHELL = shellInvocations();
const SCRIPTS = scriptInvocations();

describe("shell scripts declare their tools", () => {
  // ── Controls. Each is its own `it`: folded into the assertions below, a scan
  // that found nothing would satisfy every one of them vacuously, and the guard
  // would read green precisely when it had stopped looking.
  it("finds shell scripts to scan", () => {
    const files = SHELL_DIRS.flatMap((dir) =>
      existsSync(join(PKG_ROOT, dir))
        ? readdirSync(join(PKG_ROOT, dir)).filter((name) => name.endsWith(".sh"))
        : []
    );
    expect(files.length).toBeGreaterThan(0);
  });

  it("finds at least one package-binary invocation in those scripts", () => {
    expect(SHELL.length).toBeGreaterThan(0);
  });

  it("resolves binaries through each dependency's own bin field", () => {
    // `tsc` comes from `typescript`, so a name-equality scan cannot produce it.
    // This control fails if `binariesProvidedBy` ever degrades into one.
    expect(CLI_BINARIES.has("tsc")).toBe(true);
    expect(CLI_BINARIES.has("typescript")).toBe(false);
  });

  it("reads npm scripts too", () => {
    expect(SCRIPTS.length).toBeGreaterThan(0);
  });

  // ── The two tiers.
  it("every tool a shell script runs is declared by @agent-nexus/cli itself", () => {
    const undeclared = SHELL.filter(({ tool }) => !CLI_BINARIES.has(tool)).map(
      ({ tool, source }) =>
        `${source} runs \`${tool}\`, which no dependency of packages/cli provides. ` +
        `It resolves from the monorepo root here and is ABSENT in the public mirror.`
    );
    expect(undeclared).toEqual([]);
  });

  it("every tool an npm script runs is declared somewhere", () => {
    const undeclared = SCRIPTS.filter(
      ({ tool }) => !CLI_BINARIES.has(tool) && !ROOT_BINARIES.has(tool)
    ).map(
      ({ tool, source }) =>
        `${source} runs \`${tool}\`, which neither packages/cli nor the workspace root declares.`
    );
    expect(undeclared).toEqual([]);
  });
});
