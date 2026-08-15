import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedProfile } from "../config";

// ── Mock the config module ────────────────────────────────────────────────
// The machine-wide switch calls setActiveProfile, getProfile, resolveProfile and
// listProfiles (to decide whether there is a second profile to clobber); the
// rest are referenced by other (unexercised) auth subcommands, so leaving them
// undefined is harmless here.
const mockSetActiveProfile = vi.fn();
const mockGetProfile = vi.fn();
const mockResolveProfile = vi.fn();
const mockListProfiles = vi.fn();

vi.mock("../config", () => ({
  setActiveProfile: (...a: unknown[]) => mockSetActiveProfile(...a),
  getProfile: (...a: unknown[]) => mockGetProfile(...a),
  resolveProfile: (...a: unknown[]) => mockResolveProfile(...a),
  listProfiles: (...a: unknown[]) => mockListProfiles(...a),
  resolveBaseUrl: () => "https://api.nexusgpt.io"
}));

import { registerAuthCommands } from "./auth";

/**
 * Build a fresh program mirroring index.ts's global flags, register auth, run
 * the given argv, and capture stdout (console.log) + stderr (process.stderr)
 * separately — the warning must land on stderr, never stdout (NEX-2176).
 */
async function runSwitch(argv: string[]): Promise<{ stdout: string; stderr: string }> {
  const program = new Command();
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--api-key <key>", "Override API key for this invocation")
    .option("--base-url <url>", "Override API base URL")
    .option("--profile <name>", "Use a specific named profile");
  registerAuthCommands(program);

  const stdout: string[] = [];
  const stderr: string[] = [];
  const logSpy = vi
    .spyOn(console, "log")
    .mockImplementation((...args: unknown[]) => void stdout.push(args.map(String).join(" ")));
  const errSpy = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => void stderr.push(args.map(String).join(" ")));
  const writeSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    });

  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    writeSpy.mockRestore();
  }

  return { stdout: stdout.join("\n"), stderr: stderr.join("") };
}

function resolved(name: string, source: ResolvedProfile["source"]): ResolvedProfile {
  return { name, source, profile: { apiKey: "nxs_test" } };
}

describe("NEX-2361: auth switch warns when an override makes it a no-op", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    mockGetProfile.mockReturnValue({ apiKey: "nxs_b", orgName: "Org B" });
    mockListProfiles.mockReturnValue({
      profiles: { "org-a": { apiKey: "nxs_a" }, "org-b": { apiKey: "nxs_b" } },
      activeProfile: "org-b"
    });
    delete process.env.NEXUS_API_KEY;
    delete process.env.NEXUS_PROFILE;
  });

  afterEach(() => {
    process.exitCode = undefined;
    delete process.env.NEXUS_API_KEY;
    delete process.env.NEXUS_PROFILE;
  });

  it("warns and exits non-zero when NEXUS_API_KEY env override is active", async () => {
    process.env.NEXUS_API_KEY = "nxs_orgA";
    mockResolveProfile.mockReturnValue(resolved("override", "override"));

    const { stdout, stderr } = await runSwitch(["auth", "switch", "org-b"]);

    expect(mockSetActiveProfile).toHaveBeenCalledWith("org-b");
    // Success still prints (the saved active profile did change)...
    expect(stdout).toContain('Switched to "org-b"');
    // ...but a loud warning lands on stderr, naming the env var and the fix.
    expect(stderr).toContain("NEXUS_API_KEY is set");
    expect(stderr).toContain("NOT take effect");
    expect(stderr).toContain("unset NEXUS_API_KEY");
    // The warning must NOT contaminate stdout.
    expect(stdout).not.toContain("NEXUS_API_KEY");
    // Non-zero exit halts `auth switch org-b && workspace mount`.
    expect(process.exitCode).toBe(1);
    // The next-process prediction must ignore ephemeral flags on THIS
    // invocation — resolveProfile is called with no opts.
    expect(mockResolveProfile).toHaveBeenCalledWith();
  });

  it("does NOT warn for an ephemeral --api-key flag (it never reaches the next process)", async () => {
    // No NEXUS_API_KEY env — only a per-invocation --api-key flag. The next
    // (flag-less) command resolves to the newly switched active profile, so the
    // switch IS effective and must not warn or exit non-zero (BugBot finding).
    mockResolveProfile.mockReturnValue(resolved("org-b", "active"));

    const { stderr } = await runSwitch(["auth", "--api-key", "nxs_orgA", "switch", "org-b"]);

    expect(stderr).toBe("");
    expect(process.exitCode).toBeUndefined();
    // Crucially, the ephemeral flag must not be forwarded into the prediction.
    expect(mockResolveProfile).toHaveBeenCalledWith();
  });

  it('warns even when switching to a profile literally named "override" under NEXUS_API_KEY', async () => {
    // "override" is a legal profile name and also the sentinel name resolveProfile
    // returns for an env-key override. A naive name-equality guard would treat
    // this as a match and stay silent — but the env key still wins, so it must
    // warn (BugBot: override env guard name collision).
    process.env.NEXUS_API_KEY = "nxs_orgA";
    mockResolveProfile.mockReturnValue(resolved("override", "override"));

    const { stderr } = await runSwitch(["auth", "switch", "override"]);

    expect(stderr).toContain("NEXUS_API_KEY is set");
    expect(stderr).toContain("NOT take effect");
    expect(process.exitCode).toBe(1);
  });

  it("warns when NEXUS_PROFILE outranks the switched profile", async () => {
    process.env.NEXUS_PROFILE = "org-a";
    mockResolveProfile.mockReturnValue(resolved("org-a", "env"));

    const { stderr } = await runSwitch(["auth", "switch", "org-b"]);

    expect(stderr).toContain('NEXUS_PROFILE="org-a"');
    expect(stderr).toContain("NOT take effect");
    expect(process.exitCode).toBe(1);
  });

  it("warns when a .nexusrc directory pin outranks the switched profile", async () => {
    mockResolveProfile.mockReturnValue(resolved("org-a", "directory"));

    const { stderr } = await runSwitch(["auth", "switch", "org-b"]);

    expect(stderr).toContain(".nexusrc");
    expect(stderr).toContain("NOT take effect");
    expect(process.exitCode).toBe(1);
  });

  it("does NOT warn and exits zero when the switch is effective (active resolution)", async () => {
    mockResolveProfile.mockReturnValue(resolved("org-b", "active"));

    const { stdout, stderr } = await runSwitch(["auth", "switch", "org-b"]);

    expect(stdout).toContain('Switched to "org-b" (Org B)');
    expect(stderr).toBe("");
    expect(process.exitCode).toBeUndefined();
  });
});
