import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * NEX-3021 — end-to-end through the real `nexus api` action.
 *
 * The reported failure was `Error: API error (201): Request failed with status
 * 201` for `nexus api POST /mcp`, with the 92 KB JSON-RPC body discarded. This
 * drives the actual command with a stubbed `fetch` that answers exactly as
 * production does, and asserts the body reaches stdout and the exit code stays
 * unset.
 *
 * The fix lives in the SDK's `HttpClient`, which `vitest.config.ts` aliases to
 * its source — a stale `packages/sdk/dist` would otherwise let this pass while
 * the shipped CLI still failed.
 */
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return {
    ...actual,
    resolveBaseUrl: () => "https://api.nexusgpt.io",
    // `nexus api` resolves a PROFILE, not a bare key: the acting organization
    // rides on the profile the key came from, so the two are ONE resolution and
    // `resolveApiKey` is no longer on this command's path. The real
    // `resolveProfile` throws CLI_NOT_AUTHENTICATED with none configured — which
    // the command catches, so every case below would read as an API failure.
    resolveProfile: () => ({
      name: "test",
      profile: { apiKey: "nxs_test", baseUrl: "https://api.nexusgpt.io" },
      source: "env"
    })
  };
});

import { EXIT_CODES } from "../exit-codes";
import { registerApiCommand } from "./api";

const JSON_RPC_TOOLS_RESULT = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    tools: [
      { name: "identity_whoami", description: "Return the calling key's org and user" },
      { name: "agents_list", description: "List agents" }
    ]
  }
};

/** Run the real command and capture what it printed. */
async function runApi(argv: string[]): Promise<{ stdout: string; exitCode: number | undefined }> {
  const program = new Command();
  program.name("nexus");
  registerApiCommand(program);

  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    lines.push(String(msg));
  });
  const error = vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
    lines.push(String(msg));
  });
  process.exitCode = undefined;

  try {
    await program.parseAsync(["node", "nexus", ...argv]);
    return { stdout: lines.join("\n"), exitCode: process.exitCode };
  } finally {
    log.mockRestore();
    error.mockRestore();
    process.exitCode = undefined;
  }
}

describe("nexus api — a 2xx is a success, whatever shape its body has", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("prints the JSON-RPC body of POST /mcp instead of 'API error (201)' (NEX-3021)", async () => {
    const fetchSpy = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(JSON_RPC_TOOLS_RESULT), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { stdout, exitCode } = await runApi([
      "api",
      "POST",
      "/mcp",
      "--body",
      '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
    ]);

    expect(exitCode).toBeUndefined();
    expect(stdout).not.toContain("API error");
    expect(JSON.parse(stdout)).toEqual({ data: JSON_RPC_TOOLS_RESULT });

    // ...and the request itself was well-formed: the body went out as JSON.
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.nexusgpt.io/api/public/v1/mcp");
    expect(init?.body).toBe('{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}');
  });

  it("keeps unwrapping the envelope for the typed routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: [{ id: "model-1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
      )
    );

    const { stdout, exitCode } = await runApi(["api", "GET", "/models"]);

    expect(exitCode).toBeUndefined();
    expect(JSON.parse(stdout)).toEqual({ data: [{ id: "model-1" }] });
  });

  it("still fails, with the server's message, on a real error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: "FORBIDDEN", message: "scope missing" }
            }),
            { status: 403, headers: { "content-type": "application/json" } }
          )
      )
    );

    const { stdout, exitCode } = await runApi(["api", "GET", "/agents"]);

    expect(exitCode).toBe(EXIT_CODES["permission-denied"]);
    expect(stdout).toContain("scope missing");
  });
});
