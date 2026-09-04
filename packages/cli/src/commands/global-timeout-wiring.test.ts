import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

// NEX-2760 follow-up: the global --timeout (seconds) must reach EVERY HTTP
// path, and must mean SECONDS everywhere — `nexus api` used to define its own
// --timeout <ms>, so the same flag changed units depending on argv position.
//
// There are three paths and they are not the same shape:
//   • `nexus api` builds a raw HttpClient itself           -> httpClientOpts
//   • every ordinary command goes through createClient,
//     which builds a NexusClient                           -> nexusClientOpts
//   • `apps` goes through the tenant transport             -> tenantOpts
//
// `credential` stands in for the createClient path below: an ordinary
// SDK-backed namespace with a no-argument `list` read.
//
// Both constructors are captured, deliberately: an assertion that reads only
// one of the two arrays cannot tell "this command stopped receiving the flag"
// from "this command moved to the other transport", and those call for opposite
// responses.

const httpClientOpts: Array<Record<string, unknown>> = [];
const nexusClientOpts: Array<Record<string, unknown>> = [];

vi.mock("@agent-nexus/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agent-nexus/sdk")>();
  return {
    ...actual,
    HttpClient: class {
      constructor(opts: Record<string, unknown>) {
        httpClientOpts.push(opts);
      }
      requestWithMeta = vi.fn().mockResolvedValue({ data: {}, meta: undefined });
    },
    NexusClient: class {
      constructor(opts: Record<string, unknown>) {
        nexusClientOpts.push(opts);
      }
      // Only the surface the cases below actually drive. A resource this stub
      // does not carry throws, which is the honest outcome: a case reaching for
      // one has changed what it exercises and should say so.
      credentials = {
        list: vi.fn().mockResolvedValue({ data: [], meta: undefined })
      };
    }
  };
});

vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return {
    ...actual,
    resolveBaseUrl: () => "http://localhost:9999",
    resolveApiKey: () => "nxs_test",
    // `createClient` resolves a PROFILE, and the real one throws
    // CLI_NOT_AUTHENTICATED with none configured — which the command catches, so
    // the failure surfaces as "no client was ever built" rather than as an
    // error. Two of the three transports below now go through it.
    resolveProfile: () => ({
      name: "test",
      profile: { apiKey: "nxs_test", baseUrl: "http://localhost:9999" },
      source: "env"
    })
  };
});

const tenantOpts: Array<Record<string, unknown>> = [];
vi.mock("../util/tenant-http", () => ({
  tenantRequest: (opts: Record<string, unknown>) => {
    tenantOpts.push(opts);
    return Promise.resolve({ cluster: null });
  }
}));

import { parseTimeoutSeconds } from "../client";
import { registerApiCommand } from "./api";
import { registerAppsCommands } from "./apps";
import { registerCredentialCommands } from "./credential";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").option("--timeout <seconds>", "timeout", parseTimeoutSeconds);
  registerApiCommand(program);
  registerAppsCommands(program);
  registerCredentialCommands(program);

  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    spy.mockRestore();
  }
}

describe("global --timeout reaches every HTTP path, always in seconds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpClientOpts.length = 0;
    nexusClientOpts.length = 0;
    tenantOpts.length = 0;
  });

  it("nexus api converts the global seconds flag to ms (no local ms flag anymore)", async () => {
    await run(["api", "GET", "/models", "--timeout", "120"]);

    expect(httpClientOpts).toHaveLength(1);
    expect(httpClientOpts[0].timeout).toBe(120_000);
  });

  it("nexus api without the flag leaves the SDK default in charge", async () => {
    await run(["api", "GET", "/models"]);

    expect(httpClientOpts[0].timeout).toBeUndefined();
  });

  it("credential reaches the SDK client with the converted timeout", async () => {
    await run(["--timeout", "90", "credential", "list"]);

    // The MILLISECOND value, asserted where it crosses into the SDK client.
    expect(nexusClientOpts).toHaveLength(1);
    expect(nexusClientOpts[0].timeout).toBe(90_000);

    // POSITIVE, and the half that makes a transport move visible rather than
    // silent: no raw transport is built. Asserting only the line above would
    // stay green if this namespace grew a second, hand-rolled client beside
    // the SDK one.
    expect(
      httpClientOpts,
      "credential must build no transport of its own — it goes through createClient"
    ).toHaveLength(0);
  });

  it("credential without the flag leaves the SDK default in charge", async () => {
    await run(["credential", "list"]);

    expect(nexusClientOpts).toHaveLength(1);
    expect(nexusClientOpts[0].timeout).toBeUndefined();
  });

  it("apps's tenant transport receives the converted timeout", async () => {
    await run(["--timeout", "45", "apps", "cluster", "status"]);

    expect(tenantOpts).toHaveLength(1);
    expect(tenantOpts[0].timeout).toBe(45_000);
  });
});
