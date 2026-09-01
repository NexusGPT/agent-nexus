import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runUpgrade, type UpgradeEnvironment } from "../../src/commands/upgrade";
import { EXIT_CODES } from "../../src/exit-codes";
import { setJsonMode } from "../../src/output";
import type { PackageManager } from "../../src/util/package-manager";
import { resolveCandidates } from "../../src/util/resolve-on-path";
import {
  buildShippedCommand,
  cleanupTempDirs,
  DECLARED_NAME,
  DECLARED_VERSION,
  digestOf,
  ensureBuilt,
  installedBinary,
  installedPackageRoot,
  installGlobally,
  LONG_SUPERSEDED,
  pack,
  type PackManifest,
  runInstalled,
  sealedEnv,
  shippedInstallCommand,
  SLOW,
  stageAtVersion,
  stagePublishedTree,
  tempDir
} from "./install-harness";
import { forgetPackSource, packSource } from "./pack-source";

/**
 * THE INSTALL STEP RUNS HERE. EVERYWHERE ELSE IT IS STUBBED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `nexus upgrade` REPLACES THE BINARY THE USER IS RUNNING, AND UNTIL THIS
 *    FILE EXISTED THAT REPLACEMENT HAD NEVER ONCE EXECUTED UNDER TEST.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `upgrade-environment.test.ts` passes `install: () => undefined`.
 * `upgrade-verifies-what-it-claims.test.ts` mocks `execSync` outright and says
 * why in its own header: "a global package install must not run in a test".
 * Both are right — a spec may not write a developer's global prefix — and
 * between them they leave `realEnvironment`'s one real line
 * (`execSync(command, { stdio: "inherit" })`) covered by nothing at all.
 *
 * The VERIFICATION half already round-trips: real PATH resolution, a real
 * spawn, a real version parse. So the command was proven honest about a machine
 * it never changed. This file supplies the missing half by giving the install a
 * place it is ALLOWED to run — a throwaway prefix under `os.tmpdir()` — and then
 * reading the machine back the way a user would: by running the binary.
 *
 * ── WHAT IS REAL, AND WHAT IS NOT ───────────────────────────────────────────
 *
 * REAL: `npm pack` (the artifact a user receives), `npm install --global` (the
 * verb `getGlobalInstallCommand` builds), the `bin` mapping, the shebang, the
 * dependency resolution, PATH resolution, the spawn, the version parse, and
 * `runUpgrade`'s own control flow end to end.
 *
 * `npm pack` is handed {@link packSource} rather than the package directory
 * itself: the same tree, HARD-LINKED, with only `node_modules` omitted — which
 * npm excludes from a tarball unconditionally, and which it otherwise walks
 * clean through the pnpm symlink store at a measured cost of seconds. That is
 * not a fourth substitution, and `pack-source.ts` carries both the measurement
 * and the two assertions that keep it from becoming one.
 *
 * NOT REAL — three substitutions, none of them negotiable:
 *   · THE REGISTRY. `fetchLatest` is stubbed. A spec may not depend on
 *     npmjs.com being up, and it may certainly not publish anything.
 *   · THE PACKAGE SPEC. The install points at a local `.tgz` rather than
 *     `@agent-nexus/cli@latest`, which would fetch whatever the world currently
 *     holds — neither this commit nor reproducible.
 *   · THE PREFIX. `--prefix <tmp>`, which is the whole reason this may run.
 *
 * What those give up is covered elsewhere:
 * `compatibility-ships-in-the-tarball.test.ts` interrogates the manifest and
 * `util/version-check.test.ts` covers the registry call.
 *
 * ── WHY BOTH SUITES SHARE ONE FILE ──────────────────────────────────────────
 *
 * Vitest runs test FILES in parallel workers. `beforeAll` here may build
 * `dist/`, and two workers running `tsup` against one output directory is a
 * corrupt build, not a slow one. One file is one worker, so the build and the
 * pack happen exactly once and every case below reuses the same artifact.
 *
 * ── ANTI-VACUITY ────────────────────────────────────────────────────────────
 *
 * Every positive claim has a negative control that SHIPS WITH IT, because a
 * mutation run once on a laptop protects nobody a month later:
 *   · a tarball whose `bin` names a file that is not in it must NOT yield a
 *     working binary — so "the binary reports <version>" cannot be passing by
 *     accident of some other `nexus` being reachable;
 *   · a corrupted package spec must make `runUpgrade` report `local-failed` AND
 *     leave the old binary in place — so "the upgrade replaced it" is a claim
 *     about this install rather than about the prefix's history.
 */

let realTarball: string;
let realManifest: PackManifest;

beforeAll(() => {
  ensureBuilt();
  // `packSource()` is PACKAGE_ROOT with `node_modules` omitted, hard-linked so
  // npm reads the same inodes. `pack-source.ts` carries the measurement and the
  // two assertions that make the omission provably free; the short version is
  // that npm walks the pnpm symlink store to build a tarball containing none of
  // it, and that walk was the largest single cost in this file.
  const packed = pack(packSource(), tempDir("artifact"));
  realTarball = packed.tarball;
  realManifest = packed.manifest;
}, 900_000);

// Several ~11 MB installs and tarballs per run. Left behind they accumulate on
// every developer's machine and every CI runner, which is how a correct suite
// becomes one people switch off.
afterAll(() => {
  cleanupTempDirs();
  forgetPackSource();
});

describe("the packed tarball installs and the installed binary runs", () => {
  /**
   * One install, reused by every READ-ONLY case below.
   *
   * The case that asserts the install CREATED the binary keeps its own fresh
   * prefix, because its claim is about the before-state and a shared prefix
   * would already be populated. Everything else only reads, and paying for a
   * separate ~11 MB install per assertion buys no isolation it uses.
   */
  let sharedPrefix: string;
  let sharedHome: string;

  beforeAll(() => {
    sharedPrefix = tempDir("prefix");
    sharedHome = tempDir("home");
    const install = installGlobally(realTarball, sharedPrefix);
    expect({ status: install.status, stderr: install.stderr }).toMatchObject({ status: 0 });
  }, SLOW);

  it("packed THIS package, and the artifact is on disk", () => {
    // Anti-vacuity: a manifest for the wrong package, or a tarball that was
    // never written, makes every install below meaningless.
    expect(realManifest.name).toBe("@agent-nexus/cli");
    expect(realManifest.version).toBe(DECLARED_VERSION);
    expect(existsSync(realTarball)).toBe(true);
    expect(realManifest.files.map((file) => file.path)).toContain("dist/index.js");
  });

  it(
    "installs into a throwaway prefix and creates the binary the bin mapping names",
    () => {
      const prefix = tempDir("prefix");

      // The prefix is empty BEFORE the install. Without this, a binary found
      // afterwards proves nothing about the install having created it.
      expect(existsSync(installedBinary(prefix))).toBe(false);

      const install = installGlobally(realTarball, prefix);
      // The stderr rides along so a failure names npm's reason rather than
      // printing `null !== 0`.
      expect({ status: install.status, stderr: install.stderr }).toMatchObject({ status: 0 });
      expect(existsSync(installedBinary(prefix))).toBe(true);
    },
    SLOW
  );

  it(
    "reports the version this checkout declares, read back by RUNNING it",
    () => {
      const version = runInstalled(sharedPrefix, sharedHome, ["--version"]);
      expect(version.status).toBe(0);
      expect(version.stdout.trim()).toBe(DECLARED_VERSION);
    },
    SLOW
  );

  it(
    "executes a real command, not only --version",
    () => {
      // `--help` on the very command under test. A binary that starts but whose
      // command tree failed to build exits non-zero here, while `--version` is
      // answered before the tree is walked and would still look fine.
      const help = runInstalled(sharedPrefix, sharedHome, ["upgrade", "--help"]);
      expect(help.status).toBe(0);
      expect(help.stdout).toContain("upgrade");

      const root = runInstalled(sharedPrefix, sharedHome, ["--help"]);
      expect(root.status).toBe(0);
      expect(root.stdout).toContain("upgrade");
    },
    SLOW
  );

  it(
    "carries the runtime skills payload into the install, not just the JS",
    () => {
      // `tsup.config.ts` copies `skills-content.generated.json` into `dist/`
      // because it is DATA read at runtime and must not be bundled. Its own
      // comment records the failure it guards: without that copy every skills
      // command throws "payload is missing" while the build stays green. Such a
      // package starts, answers `--version`, and is broken.
      expect(
        existsSync(
          join(installedPackageRoot(sharedPrefix), "dist", "skills-content.generated.json")
        )
      ).toBe(true);
    },
    SLOW
  );

  it(
    "NEGATIVE CONTROL: a tarball whose bin names a missing file yields no working binary",
    () => {
      // Proves the cases above have teeth. If they were passing because some
      // other `nexus` was reachable, or because a spawn failure was being read
      // as success, this case would pass too — and it must not.
      const staged = stagePublishedTree((pkg) => {
        pkg.bin = { nexus: "dist/does-not-exist.js" };
      });
      const broken = pack(staged, tempDir("artifact"));
      const prefix = tempDir("prefix");
      const home = tempDir("home");

      installGlobally(broken.tarball, prefix);

      expect(runInstalled(prefix, home, ["--version"]).stdout.trim()).not.toBe(DECLARED_VERSION);
    },
    SLOW
  );
});

describe("the command getGlobalInstallCommand builds is the one that gets run", () => {
  /**
   * ════════════════════════════════════════════════════════════════════════════
   * 🚨 A USER NEVER RUNS A STRING A TEST INVENTED.
   * ════════════════════════════════════════════════════════════════════════════
   *
   * Every case in this file installs through `shippedInstallCommand`, which
   * takes the REAL output of `getGlobalInstallCommand` and changes only the
   * registry spec and the destination. So a wrong verb, a wrong flag or a wrong
   * manager syntax reds the whole suite instead of passing forever beside a
   * hand-written command that happened to work.
   *
   * That closes the last seam. `detectPackageManager` takes no parameters — it
   * reads `process.argv[1]` and `fs.realpathSync` as globals — so the manager is
   * driven by setting that global, which is the idiom
   * `src/util/package-manager.test.ts` already established for this exact
   * function. No production signature changed to make this testable.
   */

  it("emits npm's real global-install verb, and it is what the suite runs", () => {
    const built = buildShippedCommand("npm");

    // The documented failure this guards: an `update`/`upgrade` verb resolves
    // within the range a global root already recorded, and npm/pnpm/yarn all
    // record `^0.x.y` — a caret on a `0.` major, which by semver does not admit
    // the next minor. `package-manager.ts` carries the measurement.
    expect(built).toBe(`npm install -g ${DECLARED_NAME}@latest`);
    expect(built).not.toContain("update");
  });

  it(
    "installs a working binary using that exact verb and flags",
    () => {
      // Not a re-assertion of the string: the command is EXECUTED, and the
      // binary it produces is run. A verb that parses and does not install
      // passes the case above and fails this one.
      const prefix = tempDir("prefix");
      const home = tempDir("home");
      const install = installGlobally(realTarball, prefix, "npm");

      expect({ status: install.status, stderr: install.stderr }).toMatchObject({ status: 0 });
      expect(install.command.startsWith("npm install -g ")).toBe(true);
      expect(runInstalled(prefix, home, ["--version"]).stdout.trim()).toBe(DECLARED_VERSION);
    },
    SLOW
  );

  const NON_NPM: ReadonlyArray<[PackageManager, string]> = [
    ["pnpm", `pnpm add -g ${DECLARED_NAME}@latest`],
    ["yarn", `yarn global add ${DECLARED_NAME}@latest`]
  ];

  it.each(eachOrRefuse(NON_NPM, "the non-npm managers whose install verb is asserted"))(
    "emits %s's real global-install verb",
    (manager, expected) => {
      expect(buildShippedCommand(manager)).toBe(expected);
    }
  );

  it("does NOT execute the pnpm or yarn commands, and this is why", () => {
    // ══════════════════════════════════════════════════════════════════════════
    // A VISIBLE, NAMED NON-EXECUTION — never a silent skip.
    // ══════════════════════════════════════════════════════════════════════════
    //
    // npm is executed for real above. pnpm and yarn are asserted as strings and
    // deliberately not run, and the reason is a hazard rather than convenience:
    // `--prefix` redirects npm, and it is NOT the flag that redirects the other
    // two. pnpm's global root comes from `PNPM_HOME`/`--global-dir` and yarn
    // classic's from `--global-folder`/`--prefix` depending on version, so a
    // command built here and run with npm's redirect would install into the
    // DEVELOPER'S REAL GLOBAL STORE — the exact thing this whole suite exists to
    // avoid doing.
    //
    // Running them safely needs a per-manager redirect this file does not model,
    // and guessing one is how a test corrupts the machine it runs on. The string
    // assertions above still catch the failure that actually shipped once (the
    // wrong VERB); what stays uncovered is whether pnpm/yarn accept the flags,
    // and that is stated here rather than left to be inferred from an absence.
    expect(buildShippedCommand("pnpm")).not.toContain("install -g");
    expect(buildShippedCommand("yarn")).not.toContain("add -g ");
  });

  it("restores argv[1] after driving the detection", () => {
    // `process.argv` is global to the worker. A leaked pnpm-shaped path would
    // silently change what every later case in this file builds, which is the
    // cost of a global seam and the reason the restore is in a `finally`.
    const before = process.argv[1];
    buildShippedCommand("yarn");
    expect(process.argv[1]).toBe(before);
  });
});

describe("nexus upgrade executes the install and verifies the new binary", () => {
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      stdout.push(args.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      stderr.push(args.join(" "));
    });
    // `runUpgrade`'s progress lines go through this stream rather than console,
    // and leaving it unmocked scatters them through the reporter.
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    process.exitCode = undefined;
    setJsonMode(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    setJsonMode(false);
  });

  /**
   * The OLD release artifact — packed once, installed by each case that needs one.
   *
   * `stageAtVersion` rewrites the manifest AND the version esbuild baked into
   * `dist/index.js`, because the second is the one `--version` actually prints.
   * Nothing here is a shell script pretending to be a CLI: it is the real
   * artifact, really packed and really installed, at an older number.
   *
   * A tarball is an INPUT — an install reads it and never writes it — so the
   * second case receives the same bytes whether they were packed once or twice.
   * That is asserted rather than argued: {@link digestOf} pins the file's
   * sha256 on the first pack and re-checks it on every reuse, so a fixture that
   * did acquire residue reds by name instead of quietly changing what the
   * "installed old version" is. Each case still gets its own FRESH prefix and
   * its own real install; only the artifact is shared.
   */
  let oldRelease: { tarball: string; digest: string } | undefined;

  function oldReleaseTarball(): string {
    if (oldRelease === undefined) {
      const packed = pack(stageAtVersion(LONG_SUPERSEDED), tempDir("artifact"));
      oldRelease = { tarball: packed.tarball, digest: digestOf(packed.tarball) };
    } else {
      expect(digestOf(oldRelease.tarball)).toBe(oldRelease.digest);
    }
    return oldRelease.tarball;
  }

  /** A prefix carrying a genuinely npm-installed OLD build. */
  function prefixWithOldInstall(): { prefix: string; home: string } {
    const oldTarball = oldReleaseTarball();
    const prefix = tempDir("prefix");
    const home = tempDir("home");

    expect(installGlobally(oldTarball, prefix).status).toBe(0);
    // The premise of every case below. If the old install did not take, an
    // "upgraded" verdict afterwards would be measuring nothing.
    expect(runInstalled(prefix, home, ["--version"]).stdout.trim()).toBe(LONG_SUPERSEDED);

    return { prefix, home };
  }

  /**
   * The real environment, with only the three substitutions the header names.
   *
   * `install` is the SHIPPED line — a real shell running the real command — not
   * a stub, and `resolve` is the SHIPPED resolver pointed at the throwaway
   * prefix through a real PATH rather than handed a fixture list.
   */
  function environmentInstalling(
    command: string,
    prefix: string,
    home: string
  ): UpgradeEnvironment {
    return {
      currentVersion: LONG_SUPERSEDED,
      fetchLatest: () => Promise.resolve(DECLARED_VERSION),
      installCommand: () => command,
      install: (toRun) => {
        execFileSync("sh", ["-c", toRun], { stdio: "pipe" });
      },
      resolve: () => resolveCandidates("nexus", { ...sealedEnv(home), PATH: join(prefix, "bin") }),
      elevatedBy: null
    };
  }

  it(
    "replaces an installed old version, and the new binary is what the shell then runs",
    async () => {
      const { prefix, home } = prefixWithOldInstall();

      await runUpgrade(
        environmentInstalling(shippedInstallCommand(realTarball, prefix), prefix, home)
      );

      // The command's own verdict.
      expect(stdout.join("\n")).toContain(`Upgraded to ${DECLARED_VERSION}`);
      expect(process.exitCode).toBeUndefined();

      // The machine, read back independently of anything the command printed.
      // THIS is the claim: an installed old version, an upgrade, and the new
      // binary in place, verified by running it.
      expect(runInstalled(prefix, home, ["--version"]).stdout.trim()).toBe(DECLARED_VERSION);
    },
    SLOW * 2
  );

  it(
    "NEGATIVE CONTROL: a corrupted package spec fails the upgrade and leaves the old binary",
    async () => {
      const { prefix, home } = prefixWithOldInstall();

      await runUpgrade(
        environmentInstalling(
          shippedInstallCommand(`${realTarball}.corrupted-does-not-exist`, prefix),
          prefix,
          home
        )
      );

      // `local-failed` is the arm for "the install command itself failed", and
      // it is NOT one of the post-install outcomes — nothing was installed, so
      // reporting a PATH finding here would send the reader to repair a machine
      // that was never touched.
      expect(process.exitCode).toBe(EXIT_CODES["local-failed"]);
      expect(stderr.join("\n")).toContain("Upgrade failed");

      // And the prefix is exactly as it was. A case reading only the exit code
      // could not tell a refused install from a half-completed one.
      expect(runInstalled(prefix, home, ["--version"]).stdout.trim()).toBe(LONG_SUPERSEDED);
    },
    SLOW * 2
  );
});
