/**
 * The `organization-id` header `nexus api` puts on the wire.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS FILE PINS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus api` built its `HttpClient` from `resolveApiKey` alone, so it sent
 * `api-key` and nothing else. Every org-scoped v1 route therefore answered
 * `403 ORGANIZATION_REQUIRED` for a personal (`nxs_p_`) token — including in a
 * shell that had exported `NEXUS_ORGANIZATION_ID`, and while `nexus agent list`
 * on the same key in the same shell returned 200, because `createClient`
 * resolves the org and this command did not.
 *
 * This is the same defect #4845 fixed for the vibe tenant transport, in the last
 * place that still had it: `HttpClient` has no `organizationId` concept at all —
 * `NexusClient` is what builds the header, and this command bypasses
 * `NexusClient` by construction, because it is a raw passthrough.
 *
 * Nothing could see it. The header is not a type, so `tsc` had nothing to check
 * (`defaultHeaders` is a `Record<string, string>` and accepts any key set); it is
 * not a lint subject; and every existing spec over this command drives it through
 * a stubbed `fetch` whose ARGUMENTS nobody read — the assertions were all about
 * the RESPONSE. So the only instrument that can hold this is one that reads the
 * headers the command actually handed to `fetch`, which is what this file does,
 * on every arm of the resolution.
 *
 * The three arms are `resolveOrganization`'s own precedence
 * (`NEXUS_ORGANIZATION_ID` → the profile's `orgId` → fall through to the token),
 * and the absence arm is asserted as ABSENCE rather than as an empty string. Not
 * because the server would refuse differently — `extractOrganizationId` requires
 * `length > 0`, so a blank header and no header take the same branch — but
 * because a blank one is a lie in every proxy log and trace: it shows a selection
 * that was never made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `config.ts` computes its config directory from `os.homedir()` at MODULE LOAD,
 * so a `beforeAll` that moves `HOME` is read too late. `os.homedir()` honours
 * `$HOME` on POSIX and `%USERPROFILE%` on Windows; both are set.
 */
const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-api-org-header-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import type { NexusProfile } from "../config";
import { registerApiCommand } from "./api";

const CONFIG_FILE = path.join(SANDBOX, ".nexus-mcp", "config.json");
const BASE_URL = "https://api.nexusgpt.io";

/** A personal cross-org token, in the shape the prefix check recognises. */
const PERSONAL_KEY = "nxs_p_0000000000000000";

/**
 * Every environment variable the resolution chain reads, cleared before each
 * case. Without this the ambient shell decides the arm — a developer who exports
 * `NEXUS_ORGANIZATION_ID` would turn the absence case green for the wrong reason,
 * and one who exports `NEXUS_API_KEY` would send the profile arm down the
 * override branch.
 */
const CHAIN_VARS = [
  "NEXUS_ORGANIZATION_ID",
  "NEXUS_API_KEY",
  "NEXUS_PROFILE",
  "NEXUS_BASE_URL"
] as const;

/** Headers handed to `fetch`, one entry per request, in call order. */
let sent: Record<string, string>[] = [];

function writeConfig(profile: NexusProfile): void {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ activeProfile: "sandbox", profiles: { sandbox: profile } }),
    { mode: 0o600 }
  );
}

function removeConfig(): void {
  fs.rmSync(path.dirname(CONFIG_FILE), { recursive: true, force: true });
}

/**
 * Drive `nexus api GET /models` once, through the real command, and hand back
 * the headers it sent.
 *
 * The root globals are declared here rather than imported from `index.ts`
 * because `optsWithGlobals()` reads the PARENT program — registering the command
 * on a bare `Command` is what makes `--api-key` / `--profile` / `--base-url`
 * reach the action the way they do in the shipped binary. `exitOverride` turns
 * commander's `process.exit` into a throw, so a parse failure fails the case
 * instead of killing the worker.
 */
async function apiHeaders(argv: string[]): Promise<Record<string, string>> {
  sent = [];
  vi.stubGlobal("fetch", (_url: string, init: { headers: Record<string, string> }) => {
    sent.push(init.headers);
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ success: true, data: [] }))
    });
  });

  const program = new Command();
  program
    .exitOverride()
    .option("--api-key <key>", "Override API key for this invocation")
    .option("--base-url <url>", "Override API base URL")
    .option("--profile <name>", "Use a specific named profile");
  registerApiCommand(program);

  await program.parseAsync(["node", "nexus", ...argv, "api", "GET", "/models"]);
  return sent[0] ?? {};
}

beforeEach(() => {
  for (const name of CHAIN_VARS) delete process.env[name];
  removeConfig();
  sent = [];
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const name of CHAIN_VARS) delete process.env[name];
  removeConfig();
});

describe("nexus api names the organization it acts on", () => {
  it("sends NEXUS_ORGANIZATION_ID", async () => {
    writeConfig({ apiKey: PERSONAL_KEY, personalToken: true });
    process.env.NEXUS_ORGANIZATION_ID = "org-from-env";

    const headers = await apiHeaders(["--profile", "sandbox", "--base-url", BASE_URL]);

    expect(
      headers["organization-id"],
      "the per-shell org selector must reach the wire on the raw passthrough too"
    ).toBe("org-from-env");
  });

  it("falls back to the profile's stored orgId when no env var is set", async () => {
    writeConfig({ apiKey: PERSONAL_KEY, personalToken: true, orgId: "org-from-profile" });

    const headers = await apiHeaders(["--profile", "sandbox", "--base-url", BASE_URL]);

    expect(
      headers["organization-id"],
      "an org selected by `auth use-org` must reach the wire"
    ).toBe("org-from-profile");
  });

  it("lets the env var outrank the profile's orgId — the precedence, not just the presence", async () => {
    writeConfig({ apiKey: PERSONAL_KEY, personalToken: true, orgId: "org-from-profile" });
    process.env.NEXUS_ORGANIZATION_ID = "org-from-env";

    // Both selectors are populated and they disagree, so a command that read the
    // profile first would still send a plausible org id. Only pinning WHICH one
    // wins can see that, and `resolveOrganization`'s docblock says the env var is
    // deliberately on top: it is the per-shell selector, the counterpart of
    // NEXUS_PROFILE, and the only way to hold two organizations concurrently
    // under one shared config file.
    const headers = await apiHeaders(["--profile", "sandbox", "--base-url", BASE_URL]);

    expect(
      headers["organization-id"],
      "NEXUS_ORGANIZATION_ID outranks the profile's stored orgId"
    ).toBe("org-from-env");
  });

  it("sends NO organization-id when nothing selected one — absent, never blank", async () => {
    writeConfig({ apiKey: PERSONAL_KEY, personalToken: true });

    const headers = await apiHeaders(["--profile", "sandbox", "--base-url", BASE_URL]);

    // Asserted as ABSENCE, not as `""`. The guard would refuse a blank header
    // identically (`extractOrganizationId` requires `length > 0`), so this is not
    // about the refusal — it is about what a proxy log, a trace and `curl -v`
    // show: a blank header reads as a selection that was made and was empty.
    expect(
      {
        org: "organization-id" in headers,
        // The control: an omitted org must not cost the key, and a request that
        // never left the process would satisfy the claim above for free.
        keyed: headers["api-key"],
        requests: sent.length
      },
      "with no org selected the header is omitted entirely and the key still goes"
    ).toEqual({ org: false, keyed: PERSONAL_KEY, requests: 1 });
  });

  /**
   * The `--api-key` / `NEXUS_API_KEY` override is the arm `auth use-org` refuses
   * to store an org for — it tells the user to export `NEXUS_ORGANIZATION_ID`
   * instead. That instruction is only true if the override path resolves the org
   * as well as the key, which is exactly what this case proves.
   */
  it("sends NEXUS_ORGANIZATION_ID under an --api-key override, which is the only org an override can name", async () => {
    process.env.NEXUS_ORGANIZATION_ID = "org-from-env";

    const headers = await apiHeaders(["--api-key", PERSONAL_KEY, "--base-url", BASE_URL]);

    expect(
      { org: headers["organization-id"], keyed: headers["api-key"] },
      "an override must still honour the env var it is told to use"
    ).toEqual({ org: "org-from-env", keyed: PERSONAL_KEY });
  });

  /**
   * Regression guard for the resolver's shape change. `resolveApiKey` returned
   * `override` before touching `resolveProfile` at all; the org resolution needs
   * the resolved PROFILE, so `globals.apiKey` is now passed through instead. That
   * is only safe because `resolveProfile` returns on an explicit key at step 1
   * without loading config — which is what a headless caller with no config file
   * depends on.
   */
  it("still resolves an --api-key override with no config file on disk", async () => {
    removeConfig();
    expect(fs.existsSync(CONFIG_FILE), "the case is vacuous if a config file exists").toBe(false);

    const headers = await apiHeaders(["--api-key", PERSONAL_KEY, "--base-url", BASE_URL]);

    expect(
      {
        keyed: headers["api-key"],
        org: "organization-id" in headers,
        requests: sent.length
      },
      "an override with no config and no env var sends the key and no org"
    ).toEqual({ keyed: PERSONAL_KEY, org: false, requests: 1 });
  });
});
