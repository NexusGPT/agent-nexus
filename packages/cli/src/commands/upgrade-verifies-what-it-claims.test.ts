import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";
// DELIBERATELY only the two symbols that exist BEFORE the fix as well. This
// file is the red proof, so it has to be loadable against the pre-fix tree —
// importing `runUpgrade` would turn a behavioural failure into an import error,
// which proves nothing about what the command printed. The injectable seam is
// covered by `upgrade-environment.test.ts` instead.
import { registerUpgradeCommand, UPGRADE_ALIASES } from "./upgrade";

/**
 * `nexus upgrade` may not claim an outcome it did not read back.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE BUG WAS NOT A MISSING BRANCH. IT WAS A SENTENCE PRINTED WITHOUT A CHECK.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The shipped body was three statements: build the install command, `execSync`
 * it, print "Successfully upgraded to <latest>." An install that lands in a
 * prefix the shell does not search FIRST satisfies all three and leaves the user
 * on the old build — which is what kept a user on 0.22 for days while every run
 * congratulated him.
 *
 * A branch-coverage spec cannot see that class: there was no wrong branch to
 * enter. Only driving the command and READING WHAT IT PRINTED can, which is why
 * this file runs the real action against a real PATH and asserts on stdout.
 *
 * ── THE RED THIS FILE IS BUILT TO PRODUCE ───────────────────────────────────
 *
 * The first case drives the command through commander — the entry point that
 * exists identically before and after the fix — with the installer stubbed to
 * succeed and a PATH carrying a `nexus` that reports the OLD version. Against
 * the pre-fix tree it prints "Successfully upgraded to 99.0.0." and the
 * assertion fails naming that string. It is the defect verbatim, not a proxy.
 *
 * ── WHAT IS STUBBED, AND WHY IT IS ONLY THESE TWO ───────────────────────────
 *
 * `execSync` (a global package install must not run in a test) and the registry
 * lookup (no network). PATH resolution, the spawn, and the version parse are all
 * REAL against a real executable in a temp directory — those three are the
 * mechanism under test, and stubbing any of them would leave the spec asserting
 * on its own fixture.
 *
 * ── WHY THE VERSIONS ARE 99.0.0 AND 0.22.4 ──────────────────────────────────
 *
 * The running version is read with `require("../../package.json")`, which no
 * module mock intercepts, so it is the REAL shipped version and it moves with
 * every release. The fixtures therefore straddle it from both sides rather than
 * pinning it: 99.0.0 is above any version this package will publish, and 0.22.4
 * is below every version it already has. A release cannot make this file lie.
 */

const execSyncMock = vi.hoisted(() => vi.fn());
const fetchLatestMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  // `spawnSync` is deliberately NOT stubbed — the verification step spawns the
  // resolved binary, and that is the half being proven.
  execSync: execSyncMock
}));

vi.mock("../util/version-check", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../util/version-check")>()),
  // `compareSemver` stays real: it is the comparison the verdict is made of.
  fetchLatestVersion: fetchLatestMock
}));

/** Above anything this package will ever publish. */
const UNREACHABLY_NEW = "99.0.0";
/** Below every version this package has already published. */
const LONG_SUPERSEDED = "0.22.4";

/** A directory on PATH holding an executable `nexus` that reports `version`. */
function fakeBinDir(root: string, name: string, version: string | null): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const binary = join(dir, "nexus");
  writeFileSync(
    binary,
    version === null
      ? // A shim pointing into a directory its package manager has collected —
        // the loud half of this defect. It fails before printing anything.
        "#!/bin/sh\n" +
          "echo \"Error: Cannot find module '/global/v11/85d5-collected" +
          "/node_modules/@agent-nexus/cli/dist/index.js'\" >&2\n" +
          "exit 1\n"
      : `#!/bin/sh\necho "${version}"\n`,
    { mode: 0o755 }
  );
  chmodSync(binary, 0o755);
  return dir;
}

let root: string;
let originalPath: string | undefined;
let stdout: string[];
let stderr: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cli-upgrade-verify-"));
  originalPath = process.env.PATH;
  stdout = [];
  stderr = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdout.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr.push(args.join(" "));
  });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  execSyncMock.mockReset().mockReturnValue(Buffer.from(""));
  fetchLatestMock.mockReset().mockResolvedValue(UNREACHABLY_NEW);
  process.exitCode = undefined;
  setJsonMode(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.PATH = originalPath;
  process.exitCode = undefined;
  setJsonMode(false);
  rmSync(root, { recursive: true, force: true });
});

/** Drive the SHIPPED entry point — commander, the registered action, all of it. */
async function runThroughCommander(entryPoint = "upgrade"): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerUpgradeCommand(program);
  await program.parseAsync(["node", "nexus", entryPoint]);
}

/** Everything the run put in front of a human, on either channel. */
function printed(): string {
  return [...stdout, ...stderr].join("\n");
}

describe("nexus upgrade — the success message is a claim about the PATH", () => {
  it("does NOT report success when the shell still resolves the old version", async () => {
    process.env.PATH = fakeBinDir(root, "stale-bin", LONG_SUPERSEDED);

    await runThroughCommander();

    // THE RED. The pre-fix tree prints exactly this and nothing else changes.
    expect(printed()).not.toMatch(/Successfully upgraded/);
    expect(printed()).toMatch(/still 0\.22\.4/);
    // Control: the install really was attempted. Without this, a command that
    // silently did nothing at all would satisfy the assertion above.
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });

  it("prints EVERY nexus on the PATH, not just the winner", async () => {
    // The shadowing entry is first and the new install is second — which is
    // precisely why `which nexus` alone cannot diagnose this.
    process.env.PATH = [
      fakeBinDir(root, "old-first", LONG_SUPERSEDED),
      fakeBinDir(root, "new-second", UNREACHABLY_NEW)
    ].join(":");

    await runThroughCommander();

    expect(printed()).toMatch(/old-first/);
    expect(printed()).toMatch(/new-second/);
    expect(printed()).toMatch(/which -a nexus/);
    // The command it actually ran, verbatim — the reader's next move after
    // fixing the PATH is to run that one line again.
    expect(printed()).toMatch(/Installed with: (npm install|pnpm add|yarn global add) -g/);
  });

  it("puts each PATH entry on its OWN line, never comma-joined onto one", async () => {
    // ══════════════════════════════════════════════════════════════════════════
    // 🚨 THIS REGRESSION SHIPPED ONCE AND EVERY OTHER TEST IN THIS FILE PASSED.
    // ══════════════════════════════════════════════════════════════════════════
    //
    // `formatResolutionList` returns lines. Dropping that array into
    // `[...].join("\n  ")` as ONE element stringifies it with commas, and the
    // whole resolution list — the entire diagnostic — collapses onto a single
    // comma-separated line. A one-line render still CONTAINS every substring a
    // multi-line one does, so `toMatch(/old-first/)` and friends stayed green.
    //
    // Structure, therefore, not substrings.
    process.env.PATH = [
      fakeBinDir(root, "row-one", LONG_SUPERSEDED),
      fakeBinDir(root, "row-two", UNREACHABLY_NEW)
    ].join(":");

    await runThroughCommander();

    const lines = printed().split("\n");
    const first = lines.filter((line) => line.includes("row-one"));
    const second = lines.filter((line) => line.includes("row-two"));

    // Control: both entries were rendered at all.
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    // The assertion the collapse fails: two entries, two DIFFERENT lines.
    expect(first[0]).not.toContain("row-two");
    expect(lines.indexOf(first[0])).toBeLessThan(lines.indexOf(second[0]));
  });

  it("reports success only when the resolved binary agrees", async () => {
    process.env.PATH = fakeBinDir(root, "fresh-bin", UNREACHABLY_NEW);

    await runThroughCommander();

    expect(stdout.join("\n")).toMatch(/Upgraded to 99\.0\.0/);
    expect(process.exitCode).toBeUndefined();
  });
});

describe("nexus upgrade — exit codes separate the two failures", () => {
  it("exits 2 when the install succeeded and the shell resolves an older copy", async () => {
    process.env.PATH = fakeBinDir(root, "stale-bin", LONG_SUPERSEDED);
    await runThroughCommander();
    expect(process.exitCode).toBe(EXIT_CODES["outcome-not-reached"]);
  });

  it("exits 2, not 0, when the resolved binary will not start", async () => {
    process.env.PATH = fakeBinDir(root, "broken-bin", null);
    await runThroughCommander();

    expect(process.exitCode).toBe(EXIT_CODES["outcome-not-reached"]);
    expect(printed()).toMatch(/will not start/);
    expect(printed()).toMatch(/Cannot find module/);
    expect(printed()).not.toMatch(/Successfully upgraded/);
  });

  it("exits 2 when no nexus is on the PATH at all", async () => {
    process.env.PATH = join(root, "empty-and-nonexistent");
    await runThroughCommander();

    expect(process.exitCode).toBe(EXIT_CODES["outcome-not-reached"]);
    expect(printed()).toMatch(/no "nexus" is on your PATH/);
  });

  it("still exits 1 — nothing changed — when the registry is unreachable", async () => {
    fetchLatestMock.mockResolvedValue(null);
    process.env.PATH = fakeBinDir(root, "stale-bin", LONG_SUPERSEDED);

    await runThroughCommander();

    expect(process.exitCode).toBe(EXIT_CODES["connection-failed"]);
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("still exits 1 — nothing changed — when the install command itself fails", async () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });
    process.env.PATH = fakeBinDir(root, "stale-bin", LONG_SUPERSEDED);

    await runThroughCommander();

    expect(process.exitCode).toBe(EXIT_CODES["local-failed"]);
    // The manual command is the whole remedy for an EACCES prefix.
    expect(stderr.join("\n")).toMatch(/Try running manually:/);
  });

  it("verifies nothing and exits 0 when the CLI is already current", async () => {
    // Anything at or below the running version means "you are current".
    fetchLatestMock.mockResolvedValue("0.0.1");

    await runThroughCommander();

    expect(process.exitCode).toBeUndefined();
    expect(execSyncMock).not.toHaveBeenCalled();
    expect(stdout.join("\n")).toMatch(/Already up-to-date/);
  });
});

describe("nexus upgrade --json stays ONE document", () => {
  /**
   * The shadow report is long and multi-line, and the temptation is to write the
   * resolution list to stdout beside the error document. That is two documents,
   * and `JSON.parse` refuses the pair — the defect `output.ts` funnels against.
   */
  it("emits exactly one parseable document when the install is shadowed", async () => {
    process.env.PATH = fakeBinDir(root, "json-shadowed", LONG_SUPERSEDED);
    setJsonMode(true);

    await runThroughCommander();

    expect(stdout).toHaveLength(1);
    const document = JSON.parse(stdout[0]) as { error: { code: string; hint: string } };
    expect(document.error.code).toBe("CLI_UPGRADE_NOT_RESOLVED");
    // The list is IN the hint rather than in a fourth key — the error document
    // is a three-key contract every failure in this CLI shares.
    expect(document.error.hint).toMatch(/which -a nexus/);
  });

  it("emits exactly one parseable document when the resolved binary is broken", async () => {
    process.env.PATH = fakeBinDir(root, "json-broken", null);
    setJsonMode(true);

    await runThroughCommander();

    expect(stdout).toHaveLength(1);
    const document = JSON.parse(stdout[0]) as { error: { code: string } };
    expect(document.error.code).toBe("CLI_UPGRADE_NOT_RESOLVED");
  });

  it("emits exactly one parseable document on success", async () => {
    process.env.PATH = fakeBinDir(root, "json-fresh", UNREACHABLY_NEW);
    setJsonMode(true);

    await runThroughCommander();

    expect(stdout).toHaveLength(1);
    const document = JSON.parse(stdout[0]) as { success: boolean; to: string };
    expect(document.success).toBe(true);
    expect(document.to).toBe(UNREACHABLY_NEW);
  });
});

describe("every entry point gets the fix", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════════
   * 🚨 THIS IS DRIVEN, NOT INSPECTED, AND THE FIRST ATTEMPT AT IT WAS WRONG.
   * ══════════════════════════════════════════════════════════════════════════════
   *
   * One closure is registered nineteen times, so the obvious control is to
   * assert every entry point carries the SAME function object. It does not:
   * commander's `.action(fn)` stores its own wrapper around `fn`, so the tree
   * held nineteen DISTINCT `_actionHandler`s whether or not they shared a body.
   * Measured against the pre-fix tree, which has the identical structure: the
   * identity assertion failed there too, which is the tell that it was reading
   * commander's plumbing rather than this file's property.
   *
   * So each spelling is RUN, against the same shadowed PATH, and each must
   * produce the same refusal. Running them is the only statement that survives
   * both shapes — the eighteen hidden commands this replaced, and the `.alias()`
   * calls that carry the three surviving spellings today. An alias that fails to
   * resolve looks exactly like one that works until something drives it.
   */
  it.each([["upgrade"], ...UPGRADE_ALIASES.map((a) => [a])])(
    "`nexus %s` verifies the install and refuses to claim success",
    async (entryPoint) => {
      process.env.PATH = fakeBinDir(root, `sweep-${entryPoint}`, LONG_SUPERSEDED);

      await runThroughCommander(entryPoint);

      expect(printed()).toMatch(/still 0\.22\.4/);
      expect(printed()).not.toMatch(/Successfully upgraded/);
      expect(process.exitCode).toBe(EXIT_CODES["outcome-not-reached"]);
      // Control: this entry point really reached the installer. An alias that
      // silently did nothing would satisfy both assertions above.
      expect(execSyncMock).toHaveBeenCalledTimes(1);
    }
  );

  it("sweeps every registered entry point, and the roster has not shrunk", () => {
    // The denominator for the sweep above. A roster that silently emptied would
    // make `it.each` run once and report green.
    const program = new Command();
    registerUpgradeCommand(program);

    expect(UPGRADE_ALIASES).toHaveLength(3);

    // ONE command now, carrying its spellings as aliases. Asserting the name
    // list alone would pass over a build in which every `.alias()` call was
    // dropped, so the aliases are read back off the command itself.
    const registered = program.commands as Command[];
    expect(registered.map((c) => c.name())).toEqual(["upgrade"]);
    expect([...registered[0].aliases()].sort()).toEqual([...UPGRADE_ALIASES].sort());
  });
});
