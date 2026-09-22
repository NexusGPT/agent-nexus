import fs from "node:fs";
import path from "node:path";

import type { Command } from "commander";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 🚨 HOISTED, BEFORE THE IMPORTS BELOW. `config.ts` computes its config
 * directory from `os.homedir()` at MODULE LOAD, so moving `HOME` inside a
 * `beforeEach` is too late — every profile case then reads the developer's real
 * config, finds neither profile, and falls through to the ambient env var. The
 * named-profile case would answer the env's host, which is EXACTLY the defect
 * under test, so the fixture would manufacture a pass. `dashboard-url.test.ts`
 * measured this and its note is the reason this one is written the same way.
 */
const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-base-url-precedence-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

/**
 * Capture the options the SDK client is constructed with.
 *
 * PARTIAL mock: only `NexusClient` is replaced, so `createClient`'s own
 * resolution — the thing under test — is the real one. A hand-written stub of
 * the resolution here would let this file pass while production broke.
 */
const constructed = vi.hoisted(() => ({ opts: [] as { baseUrl?: string }[] }));
vi.mock("@agent-nexus/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agent-nexus/sdk")>()),
  NexusClient: class {
    constructor(opts: { baseUrl?: string }) {
      constructed.opts.push(opts);
    }
  }
}));

import { createClient } from "./client";
import { runStatus } from "./commands/auth/status.handler";
import { resolveBaseUrl } from "./config";

const FLAG = "http://127.0.0.1:19501";
const AMBIENT = "http://127.0.0.1:19502";
const BETA = "http://127.0.0.1:19503";
const ACTIVE = "http://127.0.0.1:19504";

const CONFIG = {
  activeProfile: "default",
  profiles: {
    default: { apiKey: "nxs_o_default_aaaaaaaaaaaa", baseUrl: ACTIVE },
    beta: { apiKey: "nxs_o_beta_bbbbbbbbbbbb", baseUrl: BETA }
  }
};

beforeEach(() => {
  fs.mkdirSync(path.join(SANDBOX, ".nexus-mcp"), { recursive: true });
  fs.writeFileSync(path.join(SANDBOX, ".nexus-mcp", "config.json"), JSON.stringify(CONFIG), {
    mode: 0o600
  });
  constructed.opts.length = 0;
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_API_KEY;
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_ENV;
  delete process.env.NEXUS_ORGANIZATION_ID;
});

afterEach(() => {
  delete process.env.NEXUS_BASE_URL;
  vi.restoreAllMocks();
});

afterAll(() => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

/** A `program` stand-in carrying exactly the globals commander would have merged. */
function programWith(globals: { baseUrl?: string; profile?: string }): Command {
  return { optsWithGlobals: () => globals } as unknown as Command;
}

/** The `api:` host `nexus auth status --no-verify` PRINTS, for those globals. */
async function hostReportedByStatus(globals: {
  baseUrl?: string;
  profile?: string;
}): Promise<string> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.join(" "));
  });
  await runStatus({ verify: false }, programWith(globals));
  spy.mockRestore();

  // Anchored on the ONE line that names the host, then the host is taken off
  // that line — never a substring search over the whole block. `auth status`
  // prints the profile name, the key and a paragraph of prose, and a bare
  // `toContain(BETA)` over all of it would pass on any line that happened to
  // carry the string.
  const api = lines.find((line) => line.includes("api:"));
  if (api === undefined) throw new Error(`no "api:" line in:\n${lines.join("\n")}`);
  const host = /(https?:\/\/\S+)/.exec(api);
  if (host === null) throw new Error(`no URL on the api line: ${api}`);
  return host[1];
}

/** The `baseUrl` `createClient` hands the SDK, for those globals. */
function hostUsedByClient(globals: { baseUrl?: string; profile?: string }): string {
  createClient(globals);
  // Indexed rather than `.at(-1)` — this package's lib target predates it, and
  // `tsc` is the only thing that says so: vitest transpiles and runs it fine.
  const last = constructed.opts[constructed.opts.length - 1];
  if (last?.baseUrl === undefined) throw new Error("NexusClient was built without a baseUrl");
  return last.baseUrl;
}

describe("resolveBaseUrl — the one rule", () => {
  it("takes --base-url over everything, including a named profile", () => {
    process.env.NEXUS_BASE_URL = AMBIENT;
    expect(resolveBaseUrl(FLAG, "beta")).toBe(FLAG);
  });

  it("takes a NAMED --profile's base over the ambient NEXUS_BASE_URL", () => {
    // The decision this PR makes, and the one arm that reds on the old chain in
    // `client.ts`. A flag typed in THIS invocation outranks a variable exported
    // once into a shell — the ordering `resolveApiKey`, `resolveProfile` and
    // `resolveDashboardUrl` already use.
    process.env.NEXUS_BASE_URL = AMBIENT;
    expect(resolveBaseUrl(undefined, "beta")).toBe(BETA);
  });

  it("takes the ambient NEXUS_BASE_URL over the merely ACTIVE profile", () => {
    // Unchanged by this PR and asserted so the cure cannot overshoot: an env var
    // still beats a profile nobody named on the command line.
    process.env.NEXUS_BASE_URL = AMBIENT;
    expect(resolveBaseUrl()).toBe(AMBIENT);
  });

  it("falls to the active profile when nothing else is set", () => {
    expect(resolveBaseUrl()).toBe(ACTIVE);
  });

  it("falls through a --profile that does not exist rather than throwing", () => {
    process.env.NEXUS_BASE_URL = AMBIENT;
    expect(resolveBaseUrl(undefined, "no-such-profile")).toBe(AMBIENT);
  });
});

describe("every surface answers with the host the request will actually reach", () => {
  // Each case is its own `it`. A failing assertion throws and aborts the rest of
  // its block, so two arms in one `it` means a mutant scores exactly one of them
  // — whichever is written first — and the other is credited with a red it never
  // earned.

  it("agrees under an ambient env var beside a named --profile", async () => {
    process.env.NEXUS_BASE_URL = AMBIENT;
    const globals = { profile: "beta" };

    // The measured defect at 7a74f2373f: status printed BETA and the client went
    // to AMBIENT. Both sides are asserted against the canon rather than against
    // each other, so two surfaces that drift the SAME way cannot agree their way
    // to green.
    expect(await hostReportedByStatus(globals)).toBe(BETA);
    expect(hostUsedByClient(globals)).toBe(BETA);
  });

  it("agrees under --base-url beside a named --profile", async () => {
    const globals = { baseUrl: FLAG, profile: "beta" };

    // The worst of the four measured arms: `--base-url` was typed in this very
    // invocation and `auth status` did not read it at all.
    expect(await hostReportedByStatus(globals)).toBe(FLAG);
    expect(hostUsedByClient(globals)).toBe(FLAG);
  });

  it("agrees under an ambient env var with no --profile named", async () => {
    process.env.NEXUS_BASE_URL = AMBIENT;
    const globals = {};

    expect(await hostReportedByStatus(globals)).toBe(AMBIENT);
    expect(hostUsedByClient(globals)).toBe(AMBIENT);
  });

  it("agrees with nothing set at all", async () => {
    const globals = {};

    expect(await hostReportedByStatus(globals)).toBe(ACTIVE);
    expect(hostUsedByClient(globals)).toBe(ACTIVE);
  });
});
