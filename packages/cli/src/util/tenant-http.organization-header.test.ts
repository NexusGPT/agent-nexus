/**
 * The `organization-id` header both tenant transports put on the wire.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS FILE PINS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `tenantRequest` and `tenantStream` sent `api-key` and nothing else, so every
 * `/api/vibe/...` route answered `403 ORGANIZATION_REQUIRED` for a personal
 * (`nxs_p_`) token — including in a shell that had exported
 * `NEXUS_ORGANIZATION_ID`, and while `nexus agent list` on the same key in the
 * same shell returned 200, because the SDK client resolves the org and these two
 * did not.
 *
 * Nothing could see it. The header is not a type, so `tsc` had nothing to check;
 * it is not a lint subject; and every existing spec over this file drives it
 * through a stubbed `fetch` whose ARGUMENTS nobody read — the assertions were all
 * about the RESPONSE. So the only instrument that can hold this is one that reads
 * the headers the transport actually handed to `fetch`, which is what this file
 * does, for both functions, on every arm of the resolution.
 *
 * The three arms are `resolveOrganization`'s own precedence, and the absence arm
 * is asserted as ABSENCE rather than as an empty string. Not because the server
 * would refuse differently — `extractOrganizationId` requires `length > 0`, so a
 * blank header and no header take the same branch — but because a blank one is a
 * lie in every proxy log and trace: it shows a selection that was never made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `config.ts` computes its config directory from `os.homedir()` at MODULE LOAD,
 * so a `beforeAll` that moves `HOME` is read too late. `os.homedir()` honours
 * `$HOME` on POSIX and `%USERPROFILE%` on Windows; both are set.
 */
const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-tenant-org-header-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import fs from "node:fs";
import path from "node:path";

import type { NexusProfile } from "../config";
import { type TenantHttpOptions, tenantRequest, tenantStream } from "./tenant-http";

const CONFIG_FILE = path.join(SANDBOX, ".nexus-mcp", "config.json");
const BASE_URL = "https://api.nexusgpt.io";
const PATH = "/api/vibe/apps";

/** A personal cross-org token, in the shape the prefix check recognises. */
const PERSONAL_KEY = "nxs_p_0000000000000000";

/**
 * Every environment variable the resolution chain reads, cleared before each
 * case. Without this the ambient shell decides the arm — a developer who
 * exports `NEXUS_ORGANIZATION_ID` would turn the absence case green for the
 * wrong reason, and one who exports `NEXUS_API_KEY` would send the profile arm
 * down the override branch.
 */
const CHAIN_VARS = [
  "NEXUS_ORGANIZATION_ID",
  "NEXUS_API_KEY",
  "NEXUS_PROFILE",
  "NEXUS_BASE_URL"
] as const;

/** Headers handed to `fetch`, one entry per request, in call order. */
let sent: Record<string, string>[] = [];

function stubFetch(makeResponse: () => unknown): void {
  vi.stubGlobal("fetch", (_url: string, init: { headers: Record<string, string> }) => {
    sent.push(init.headers);
    return Promise.resolve(makeResponse());
  });
}

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

/** Drive `tenantRequest` once and hand back the headers it sent. */
async function requestHeaders(opts: TenantHttpOptions): Promise<Record<string, string>> {
  sent = [];
  stubFetch(() => ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ success: true, data: [] }))
  }));
  await tenantRequest(opts, { method: "GET", path: PATH });
  return sent[0] ?? {};
}

/** Drive `tenantStream` once and hand back the headers it sent. */
async function streamHeaders(opts: TenantHttpOptions): Promise<Record<string, string>> {
  sent = [];
  stubFetch(() => ({
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      }
    })
  }));
  const chunks = await tenantStream(opts, {
    path: PATH,
    signal: new AbortController().signal
  });
  // Drain it, so the generator's `finally` releases rather than leaving a reader
  // and an abort listener attached for the rest of the file.
  for await (const _chunk of chunks) void _chunk;
  return sent[0] ?? {};
}

/**
 * The org header from BOTH transports, in one value.
 *
 * Deliberately one object rather than two assertions: a case aborts at its first
 * failing `expect`, so a pair would leave the second transport unjudged in
 * exactly the red run being used as proof — and `tenantStream` is the one whose
 * omission was the easier to miss.
 */
async function orgHeaderOnBoth(
  opts: TenantHttpOptions
): Promise<{ request: string | undefined; stream: string | undefined }> {
  return {
    request: (await requestHeaders(opts))["organization-id"],
    stream: (await streamHeaders(opts))["organization-id"]
  };
}

beforeEach(() => {
  for (const name of CHAIN_VARS) delete process.env[name];
  removeConfig();
  sent = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of CHAIN_VARS) delete process.env[name];
  removeConfig();
});

describe("the tenant transports name the organization they act on", () => {
  it("sends NEXUS_ORGANIZATION_ID on both transports", async () => {
    writeConfig({ apiKey: PERSONAL_KEY, personalToken: true });
    process.env.NEXUS_ORGANIZATION_ID = "org-from-env";

    expect(
      await orgHeaderOnBoth({ profile: "sandbox", baseUrl: BASE_URL }),
      "the per-shell org selector must reach the wire on the request AND the stream"
    ).toEqual({ request: "org-from-env", stream: "org-from-env" });
  });

  it("falls back to the profile's stored orgId when no env var is set", async () => {
    writeConfig({ apiKey: PERSONAL_KEY, personalToken: true, orgId: "org-from-profile" });

    expect(
      await orgHeaderOnBoth({ profile: "sandbox", baseUrl: BASE_URL }),
      "an org selected by `auth use-org` must reach the wire on both transports"
    ).toEqual({ request: "org-from-profile", stream: "org-from-profile" });
  });

  it("sends NO organization-id when nothing selected one — absent, never blank", async () => {
    writeConfig({ apiKey: PERSONAL_KEY, personalToken: true });

    const request = await requestHeaders({ profile: "sandbox", baseUrl: BASE_URL });
    const stream = await streamHeaders({ profile: "sandbox", baseUrl: BASE_URL });

    // Asserted as ABSENCE, not as `""`. The guard would refuse a blank header
    // identically (`extractOrganizationId` requires `length > 0`), so this is not
    // about the refusal — it is about what a proxy log, a trace and `curl -v`
    // show: a blank header reads as a selection that was made and was empty.
    expect(
      {
        request: "organization-id" in request,
        stream: "organization-id" in stream,
        // The control: an omitted org must not cost the key. A transport that
        // sent nothing at all would satisfy the two claims above.
        requestKeyed: request["api-key"],
        streamKeyed: stream["api-key"]
      },
      "with no org selected the header is omitted entirely and the key still goes"
    ).toEqual({
      request: false,
      stream: false,
      requestKeyed: PERSONAL_KEY,
      streamKeyed: PERSONAL_KEY
    });
  });

  /**
   * The `--api-key` / `NEXUS_API_KEY` override is the arm `auth use-org` refuses
   * to store an org for — it tells the user to export `NEXUS_ORGANIZATION_ID`
   * instead. That instruction is only true if the override path resolves the org
   * as well as the key, which is exactly what this case proves.
   */
  it("sends NEXUS_ORGANIZATION_ID under an --api-key override, which is the only org an override can name", async () => {
    process.env.NEXUS_ORGANIZATION_ID = "org-from-env";

    expect(
      await orgHeaderOnBoth({ apiKey: PERSONAL_KEY, baseUrl: BASE_URL }),
      "an override must still honour the env var it is told to use"
    ).toEqual({ request: "org-from-env", stream: "org-from-env" });
  });

  /**
   * Regression guard for the resolver's shape change. `resolveTenantApiKey`
   * returned `opts.apiKey` before touching `resolveProfile` at all; the org
   * resolution needs the resolved PROFILE, so `opts.apiKey` is now passed
   * through instead. That is only safe because `resolveProfile` returns on an
   * explicit key at step 1 without loading config — which is what a headless
   * caller with no config file depends on.
   */
  it("still resolves an --api-key override with no config file on disk", async () => {
    removeConfig();
    expect(fs.existsSync(CONFIG_FILE), "the case is vacuous if a config file exists").toBe(false);

    const request = await requestHeaders({ apiKey: PERSONAL_KEY, baseUrl: BASE_URL });
    const stream = await streamHeaders({ apiKey: PERSONAL_KEY, baseUrl: BASE_URL });

    expect(
      {
        request: request["api-key"],
        stream: stream["api-key"],
        requestOrg: "organization-id" in request,
        streamOrg: "organization-id" in stream
      },
      "an override with no config and no env var sends the key and no org"
    ).toEqual({
      request: PERSONAL_KEY,
      stream: PERSONAL_KEY,
      requestOrg: false,
      streamOrg: false
    });
  });
});
