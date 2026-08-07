import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

// NEX-2760 follow-up: the global --timeout (seconds) must reach EVERY HTTP
// path, not just createClient — `nexus api` and `agent-eval` build a raw
// HttpClient themselves, and `vibe` goes through the tenant transport. It must
// also mean seconds everywhere: `nexus api` used to define its own
// --timeout <ms>, so the same flag changed units depending on argv position.

const httpClientOpts: Array<Record<string, unknown>> = [];

vi.mock("@agent-nexus/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agent-nexus/sdk")>();
  return {
    ...actual,
    HttpClient: class {
      constructor(opts: Record<string, unknown>) {
        httpClientOpts.push(opts);
      }
      requestWithMeta = vi.fn().mockResolvedValue({ data: {}, meta: undefined });
    }
  };
});

vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return {
    ...actual,
    resolveBaseUrl: () => "http://localhost:9999",
    resolveApiKey: () => "nxs_test"
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
import { registerAgentEvalCommands } from "./agent-eval";
import { registerApiCommand } from "./api";
import { registerVibeCommands } from "./vibe";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").option("--timeout <seconds>", "timeout", parseTimeoutSeconds);
  registerApiCommand(program);
  registerAgentEvalCommands(program);
  registerVibeCommands(program);

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

  it("agent-eval's raw HttpClient receives the converted timeout", async () => {
    await run(["--timeout", "90", "agent-eval", "run", "list"]);

    expect(httpClientOpts).toHaveLength(1);
    expect(httpClientOpts[0].timeout).toBe(90_000);
  });

  it("vibe's tenant transport receives the converted timeout", async () => {
    await run(["--timeout", "45", "vibe", "cluster", "status"]);

    expect(tenantOpts).toHaveLength(1);
    expect(tenantOpts[0].timeout).toBe(45_000);
  });
});
