/**
 * NEX-2525 — `auth status` reports the organization the next request will name.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS FILE PINS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `NEXUS_ORGANIZATION_ID` is the per-shell org selector — the counterpart of
 * `NEXUS_PROFILE`, and the only way two sessions holding ONE cross-org token can
 * act on two organizations, since a profile's `orgId` lives in one shared config
 * file. `createClient` has always obeyed it. `auth status` did not read it at
 * all: it printed `profile.orgId`, so the command a user runs to answer "which
 * organization am I in" was the one place that answered with the organization
 * they were NOT in.
 *
 * The stored org NAME is the second half. It describes the profile's
 * organization, so printing it next to an id the env chose names a different
 * customer than the id does — the trap `setProfileOrganization` already
 * documents. Under the env selection the name is withheld instead.
 */
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-status-org-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import fs from "node:fs";
import path from "node:path";

import { type NexusProfile, resolveOrganization } from "../config";
import { setJsonMode } from "../output";
import { registerAuthCommands } from "./auth";

const CONFIG_FILE = path.join(SANDBOX, ".nexus-mcp", "config.json");

async function runStatus(argv: string[]): Promise<string[]> {
  const program = new Command();
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--api-key <key>", "Override API key for this invocation")
    .option("--base-url <url>", "Override API base URL")
    .option("--profile <name>", "Use a specific named profile")
    .hook("preAction", (thisCommand) => {
      if (thisCommand.optsWithGlobals().json) setJsonMode(true);
    });
  registerAuthCommands(program);

  const stdout: string[] = [];
  const logSpy = vi
    .spyOn(console, "log")
    .mockImplementation((...args: unknown[]) => void stdout.push(args.map(String).join(" ")));
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    logSpy.mockRestore();
  }
  return stdout;
}

function writeConfig(profile: NexusProfile): void {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ activeProfile: "client-a", profiles: { "client-a": profile } })
  );
}

const CROSS_ORG_PROFILE: NexusProfile = {
  apiKey: "nxs_p_aaaabbbbccccdddd",
  orgName: "Client A",
  orgId: "org_A",
  personalToken: true
};

beforeEach(() => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  writeConfig(CROSS_ORG_PROFILE);
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_ORGANIZATION_ID;
});

afterEach(() => {
  setJsonMode(false);
  process.exitCode = undefined;
  delete process.env.NEXUS_ORGANIZATION_ID;
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

describe("NEX-2525: the reported organization is the one that will be used", () => {
  it("reports the profile's org, and names it, when this shell selects nothing", async () => {
    const [document] = await runStatus(["--json", "auth", "status"]);

    expect(JSON.parse(document)).toMatchObject({
      orgId: "org_A",
      orgName: "Client A",
      orgSource: "profile"
    });
  });

  it("reports NEXUS_ORGANIZATION_ID over the profile's org, and withholds the wrong name", async () => {
    process.env.NEXUS_ORGANIZATION_ID = "org_B";

    const [document] = await runStatus(["--json", "auth", "status"]);
    const parsed = JSON.parse(document);

    expect(parsed.orgId).toBe("org_B");
    expect(parsed.orgSource).toBe("env");
    // "Client A" is org_A's name. Beside org_B it would name the wrong customer.
    expect(parsed.orgName).toBeNull();
    // The cache question is about the PROFILE, and the profile did cache an
    // identity — the env selection says nothing about that either way.
    expect(parsed.identityCached).toBe(true);
  });

  it('says "token" when nothing selects an org — the key\'s own org decides, server-side', async () => {
    writeConfig({ apiKey: "nxs_p_aaaabbbbccccdddd", personalToken: true });

    const [document] = await runStatus(["--json", "auth", "status"]);

    expect(JSON.parse(document)).toMatchObject({ orgId: null, orgSource: "token" });
  });

  it("marks the env selection in the human output, in place, and drops the wrong name", async () => {
    process.env.NEXUS_ORGANIZATION_ID = "org_B";

    const text = (await runStatus(["auth", "status"])).join("\n");

    expect(text).toContain("org_B");
    expect(text).toContain("NEXUS_ORGANIZATION_ID");
    expect(text).not.toContain("Client A");
    expect(text).not.toContain("org_A");
  });
});

describe("NEX-2525: one definition of the organization precedence", () => {
  it("puts the per-shell env var above the shared profile value", () => {
    process.env.NEXUS_ORGANIZATION_ID = "org_B";
    expect(resolveOrganization(CROSS_ORG_PROFILE)).toEqual({
      organizationId: "org_B",
      source: "env"
    });
  });

  it("falls back to the profile, then to the token", () => {
    expect(resolveOrganization(CROSS_ORG_PROFILE)).toEqual({
      organizationId: "org_A",
      source: "profile"
    });
    expect(resolveOrganization({ apiKey: "nxs_p_x" })).toEqual({ source: "token" });
  });

  it("treats an empty NEXUS_ORGANIZATION_ID as unset, not as an empty org", () => {
    // An exported-but-empty variable is how a shell profile clears one. Sending
    // an empty organization-id header would be a request naming no tenant.
    process.env.NEXUS_ORGANIZATION_ID = "";
    expect(resolveOrganization(CROSS_ORG_PROFILE)).toEqual({
      organizationId: "org_A",
      source: "profile"
    });
  });
});
