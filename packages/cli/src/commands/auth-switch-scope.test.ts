/**
 * NEX-2525 — `auth switch` can be scoped, so two sessions can hold two orgs.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS FILE PINS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `auth switch` wrote ONE value — `activeProfile` in `~/.nexus-mcp/config.json` —
 * that every process on the machine reads. Two sessions on two organizations
 * therefore shared one selection: the later switch won for both, and the session
 * that lost was told nothing. The reported incident is not a hypothetical read of
 * the wrong list; a ticket and an app were CREATED in the other organization.
 *
 * The isolating levels already existed (`NEXUS_PROFILE`, `.nexusrc`) — nothing
 * reached them from the verb that changes organizations, so the only discoverable
 * way to switch was the machine-wide one. `--here` and `--session` are those two
 * levels, reached from `switch`.
 *
 * ── WHY THIS FILE USES THE REAL CONFIG MODULE ────────────────────────────────
 *
 * The property under test is WHERE the write lands: `--here` must leave
 * `activeProfile` alone and `--session` must write nothing at all. A mocked
 * `../config` asserts that the CLI called the function this file expects, which
 * is the same statement the implementation makes — it cannot see a second write
 * through another door. So `HOME` moves (in `vi.hoisted`, before the imports:
 * `config.ts` computes its directory from `os.homedir()` at module load) and the
 * assertions read the config file and the `.nexusrc` files off disk.
 *
 * The working directory moves too, per test. `.nexusrc` is written to and read
 * from `process.cwd()`, so the two "sessions" here ARE two directories.
 */
import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-switch-scope-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";
import { registerAuthCommands } from "./auth";

const CONFIG_FILE = path.join(SANDBOX, ".nexus-mcp", "config.json");
const DIR_A = path.join(SANDBOX, "client-a");
const DIR_B = path.join(SANDBOX, "client-b");

interface Run {
  stdout: string[];
  stderr: string;
  exitCode: number | string | undefined;
}

/** Build a program mirroring index.ts's global flags and run one auth command. */
async function run(argv: string[]): Promise<Run> {
  const program = new Command();
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--api-key <key>", "Override API key for this invocation")
    .option("--base-url <url>", "Override API base URL")
    .option("--profile <name>", "Use a specific named profile")
    // index.ts's hook, because --json is not a flag the commands read: it sets
    // the module-level output mode, and without this the JSON case here would
    // silently assert against human output.
    .hook("preAction", (thisCommand) => {
      if (thisCommand.optsWithGlobals().json) setJsonMode(true);
    });
  registerAuthCommands(program);

  const stdout: string[] = [];
  const stderr: string[] = [];
  const logSpy = vi
    .spyOn(console, "log")
    .mockImplementation((...args: unknown[]) => void stdout.push(args.map(String).join(" ")));
  // Both stderr doors: `printWarning` writes the stream directly, `reportFailure`
  // goes through console.error. A capture that watches one of them reads an
  // empty stderr for half the paths here.
  const errSpy = vi
    .spyOn(console, "error")
    .mockImplementation(
      (...args: unknown[]) => void stderr.push(args.map(String).join(" ") + "\n")
    );
  const writeSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    });

  process.exitCode = undefined;
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    writeSpy.mockRestore();
  }

  const exitCode = process.exitCode;
  process.exitCode = undefined;
  return { stdout, stderr: stderr.join(""), exitCode };
}

/** The profile a bare command run in `dir` would use, read the way the CLI reads it. */
async function resolvedProfileIn(dir: string): Promise<string> {
  process.chdir(dir);
  const { resolveProfile } = await import("../config");
  return resolveProfile().name;
}

function readConfig(): { activeProfile: string; profiles: Record<string, unknown> } {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

const previousCwd = process.cwd();

beforeEach(() => {
  fs.rmSync(path.join(SANDBOX, ".nexus-mcp"), { recursive: true, force: true });
  fs.rmSync(DIR_A, { recursive: true, force: true });
  fs.rmSync(DIR_B, { recursive: true, force: true });
  fs.mkdirSync(path.join(SANDBOX, ".nexus-mcp"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(DIR_A, { recursive: true });
  fs.mkdirSync(DIR_B, { recursive: true });
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({
      activeProfile: "org-a",
      profiles: {
        "org-a": { apiKey: "nxs_aaaa1111", orgName: "Client A", orgId: "org_A" },
        "org-b": { apiKey: "nxs_bbbb2222", orgName: "Client B", orgId: "org_B" }
      }
    })
  );
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_ORGANIZATION_ID;
});

afterEach(() => {
  // Module-level, so one --json case would otherwise leak into every test after it.
  setJsonMode(false);
  process.chdir(previousCwd);
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_ORGANIZATION_ID;
});

afterAll(() => {
  process.chdir(previousCwd);
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

describe("NEX-2525: the machine-wide switch is the hazard the scopes exist for", () => {
  it("CONTROL — a plain switch in one directory repoints a bare command in the other", async () => {
    process.chdir(DIR_A);
    await run(["auth", "switch", "org-a"]);
    expect(await resolvedProfileIn(DIR_A)).toBe("org-a");

    // The second "session".
    process.chdir(DIR_B);
    await run(["auth", "switch", "org-b"]);

    // …and the first one silently moved with it. This is the defect; the two
    // tests below are the two ways out of it.
    expect(await resolvedProfileIn(DIR_A)).toBe("org-b");
  });

  it("says out loud that the switch reached every other session", async () => {
    process.chdir(DIR_A);
    const { stdout } = await run(["auth", "switch", "org-b"]);
    const text = stdout.join("\n");

    expect(text).toContain("Machine-wide");
    expect(text).toContain("--here");
    expect(text).toContain("--session");
  });
});

describe("NEX-2525: --here binds the directory and leaves the machine alone", () => {
  it("writes .nexusrc, does not touch activeProfile, and survives a switch elsewhere", async () => {
    process.chdir(DIR_A);
    const { stdout, exitCode } = await run(["auth", "switch", "org-a", "--here"]);

    expect(exitCode).toBeUndefined();
    expect(stdout.join("\n")).toContain('This directory now resolves to "org-a"');
    expect(JSON.parse(fs.readFileSync(path.join(DIR_A, ".nexusrc"), "utf8"))).toEqual({
      profile: "org-a"
    });
    // The machine-wide value is untouched — that is the whole point.
    expect(readConfig().activeProfile).toBe("org-a");

    // The other session switches machine-wide, as it always could…
    process.chdir(DIR_B);
    await run(["auth", "switch", "org-b"]);
    expect(readConfig().activeProfile).toBe("org-b");

    // …and directory A is unmoved. THE ACCEPTANCE CRITERION.
    expect(await resolvedProfileIn(DIR_A)).toBe("org-a");
    expect(await resolvedProfileIn(DIR_B)).toBe("org-b");
  });

  it("MOVES an existing pin rather than adding a second one", async () => {
    process.chdir(DIR_A);
    await run(["auth", "switch", "org-a", "--here"]);
    await run(["auth", "switch", "org-b", "--here"]);

    expect(JSON.parse(fs.readFileSync(path.join(DIR_A, ".nexusrc"), "utf8"))).toEqual({
      profile: "org-b"
    });
    expect(await resolvedProfileIn(DIR_A)).toBe("org-b");
  });

  it("refuses an unknown profile and writes no .nexusrc", async () => {
    process.chdir(DIR_A);
    const { stderr, exitCode } = await run(["auth", "switch", "typo", "--here"]);

    expect(exitCode).toBe(EXIT_CODES["not-found"]);
    expect(stderr).toContain('Profile "typo" not found');
    expect(stderr).toContain("org-a, org-b");
    expect(fs.existsSync(path.join(DIR_A, ".nexusrc"))).toBe(false);
    expect(readConfig().activeProfile).toBe("org-a");
  });

  it("warns and exits non-zero when NEXUS_API_KEY still outranks the pin it just wrote", async () => {
    process.env.NEXUS_API_KEY = "nxs_env_key";
    process.chdir(DIR_A);
    const { stderr, exitCode } = await run(["auth", "switch", "org-b", "--here"]);

    // The pin IS written — it becomes effective the moment the env var is gone —
    // but the next command in this shell would still use the env credential.
    expect(fs.existsSync(path.join(DIR_A, ".nexusrc"))).toBe(true);
    expect(stderr).toContain("NEXUS_API_KEY is set");
    expect(exitCode).toBe(1);
  });
});

describe("NEX-2525: --session binds the shell and writes nothing at all", () => {
  it("prints the export line ALONE on stdout and leaves both config and .nexusrc untouched", async () => {
    process.chdir(DIR_A);
    const { stdout, exitCode } = await run(["auth", "switch", "org-b", "--session"]);

    // A single stray byte on stdout is executed by `eval "$(…)"`, so the whole
    // of stdout must be the one line.
    expect(stdout).toEqual(['export NEXUS_PROFILE="org-b"']);
    expect(exitCode).toBeUndefined();

    expect(readConfig().activeProfile).toBe("org-a");
    expect(fs.existsSync(path.join(DIR_A, ".nexusrc"))).toBe(false);
    expect(await resolvedProfileIn(DIR_A)).toBe("org-a");
  });

  it("puts the confirmation on stderr, where an eval cannot execute it", async () => {
    process.chdir(DIR_A);
    const { stderr } = await run(["auth", "switch", "org-b", "--session"]);

    expect(stderr).toContain("org-b");
    expect(stderr).toContain("Client B");
    expect(stderr).toContain("nothing was written to disk");
  });

  it("emits ONE json document carrying the line, for shells that are not POSIX", async () => {
    process.chdir(DIR_A);
    const { stdout } = await run(["--json", "auth", "switch", "org-b", "--session"]);

    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0])).toMatchObject({
      success: true,
      profile: "org-b",
      scope: "session",
      variable: "NEXUS_PROFILE",
      value: "org-b",
      exportLine: 'export NEXUS_PROFILE="org-b"'
    });
  });

  it("warns and exits non-zero when NEXUS_API_KEY would outrank the binding", async () => {
    process.env.NEXUS_API_KEY = "nxs_env_key";
    process.chdir(DIR_A);
    const { stdout, stderr, exitCode } = await run(["auth", "switch", "org-b", "--session"]);

    // Still printed — the user may be about to unset the key — but never silent.
    expect(stdout).toEqual(['export NEXUS_PROFILE="org-b"']);
    expect(stderr).toContain("NEXUS_API_KEY is set in this shell");
    expect(stderr).toContain("outranks NEXUS_PROFILE");
    expect(exitCode).toBe(1);
  });

  it("refuses an unknown profile instead of printing a line that binds to nothing", async () => {
    process.chdir(DIR_A);
    const { stdout, stderr, exitCode } = await run(["auth", "switch", "typo", "--session"]);

    expect(stdout).toEqual([]);
    expect(stderr).toContain('Profile "typo" not found');
    expect(exitCode).toBe(EXIT_CODES["not-found"]);
  });

  it("refuses to emit shell code for a profile name that is not a plain name", async () => {
    // Only reachable via a hand-edited config.json — and the output of this one
    // command is executed by the caller's shell, so it refuses rather than quotes.
    const config = readConfig();
    config.profiles['bad";rm -rf /;#'] = { apiKey: "nxs_dangerous" };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config));

    process.chdir(DIR_A);
    const { stdout, stderr, exitCode } = await run([
      "auth",
      "switch",
      'bad";rm -rf /;#',
      "--session"
    ]);

    expect(stdout).toEqual([]);
    expect(stderr).toContain("Invalid profile name");
    expect(exitCode).toBe(EXIT_CODES["invalid-input"]);
  });
});

describe("NEX-2525: the two scopes are two places", () => {
  it("refuses --here and --session together rather than applying one of them", async () => {
    process.chdir(DIR_A);
    const { stderr, exitCode } = await run(["auth", "switch", "org-b", "--here", "--session"]);

    expect(stderr).toContain("two different scopes");
    expect(exitCode).toBe(EXIT_CODES["invalid-input"]);
    expect(fs.existsSync(path.join(DIR_A, ".nexusrc"))).toBe(false);
    expect(readConfig().activeProfile).toBe("org-a");
  });
});

describe("NEX-2525: a pin covers the directories under it", () => {
  it("resolves from a subdirectory of the pinned folder", async () => {
    process.chdir(DIR_A);
    await run(["auth", "switch", "org-a", "--here"]);

    const nested = path.join(DIR_A, "packages", "api");
    fs.mkdirSync(nested, { recursive: true });
    process.chdir(DIR_B);
    await run(["auth", "switch", "org-b"]);

    expect(await resolvedProfileIn(nested)).toBe("org-a");
  });
});
