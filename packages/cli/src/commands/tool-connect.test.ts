import { ToolConnectionResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * What `nexus tool connect` puts ON THE WIRE.
 *
 * Every defect this file guards was invisible to `tsc`, to lint and to every
 * other test in this package, because the command built an untyped bag and
 * asserted it into `ConnectToolBody` at the call. The only surface that could
 * ever have shown them is the request body, so that is what these assert —
 * against the real SDK resource over a fake transport, never a mocked resource.
 *
 * The three, each with its own case below:
 *
 *  1. The OAuth arm sent `{ authType: "oauth" }` with no `service`, which
 *     `ConnectToolOAuthBodySchema` requires. The default path could not pass
 *     validation, and there was no `--service` flag to fix it with.
 *  2. `--auth-header` sent `authorizationType`, which is on no arm of the
 *     server's union. Zod stripped it, the server created the credential, and
 *     the CLI printed success — a setting that silently did not exist.
 *  3. `--auth-type` carried a commander default, so it merged over `--body` and
 *     flipped the discriminant of the command's own documented example.
 */

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    toolConnection: new ToolConnectionResource({ request } as never)
  })
}));

import { registerToolCommands } from "./tool";

const TOOL_ID = "22222222-2222-2222-2222-222222222222";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerToolCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

/** The body of the single request the command made, or null if it made none. */
function sentBody(): unknown {
  if (request.mock.calls.length === 0) return null;
  const [, , options] = request.mock.calls[0] as [string, string, { body?: unknown }];
  return options.body;
}

describe("nexus tool connect", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({
      authorizationUrl: "https://example.com/auth",
      handshakeId: "hs-1",
      expiresAt: "2026-01-01T00:00:00.000Z"
    });
    process.exitCode = undefined;
  });

  it("sends the service on the OAuth path", async () => {
    await run(["tool", "connect", TOOL_ID, "--service", "GOOGLE_SHEETS"]);
    expect(sentBody()).toEqual({ authType: "oauth", service: "GOOGLE_SHEETS" });
  });

  it("refuses locally when OAuth has no service, instead of sending a request that cannot validate", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(["tool", "connect", TOOL_ID]);
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(error.mock.calls.flat().join(" ")).toContain("--service");
    error.mockRestore();
  });

  it("keeps the authType the operator put in --body", async () => {
    // The command's own documented example. `--auth-type`'s commander default
    // used to merge over it and flip the discriminant to "oauth".
    await run(["tool", "connect", TOOL_ID, "--body", '{"authType":"http","apiKey":"sk-abc"}']);
    expect(sentBody()).toEqual({ authType: "http", apiKey: "sk-abc" });
  });

  it("reads service out of --body too", async () => {
    await run(["tool", "connect", TOOL_ID, "--body", '{"authType":"oauth","service":"NOTION"}']);
    expect(sentBody()).toEqual({ authType: "oauth", service: "NOTION" });
  });

  it("lets an explicit flag win over the same field in --body", async () => {
    await run([
      "tool",
      "connect",
      TOOL_ID,
      "--body",
      '{"authType":"oauth","service":"NOTION"}',
      "--service",
      "GMAIL"
    ]);
    expect(sentBody()).toEqual({ authType: "oauth", service: "GMAIL" });
  });

  it("sends only fields the HTTP arm declares", async () => {
    await run([
      "tool",
      "connect",
      TOOL_ID,
      "--auth-type",
      "http",
      "--api-key-value",
      "sk-abc123",
      "--name",
      "Production key"
    ]);
    expect(sentBody()).toEqual({ authType: "http", apiKey: "sk-abc123", name: "Production key" });
  });

  it("omits name when it was not supplied, rather than sending an empty one", async () => {
    await run(["tool", "connect", TOOL_ID, "--auth-type", "http", "--api-key-value", "sk-abc123"]);
    expect(sentBody()).toEqual({ authType: "http", apiKey: "sk-abc123" });
  });

  it("no longer accepts --auth-header, which never had any effect", async () => {
    await expect(
      run([
        "tool",
        "connect",
        TOOL_ID,
        "--auth-type",
        "http",
        "--api-key-value",
        "sk-abc123",
        "--auth-header",
        "bearer"
      ])
    ).rejects.toThrow(/unknown option/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses an auth type the server's union does not declare", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(["tool", "connect", TOOL_ID, "--auth-type", "basic", "--service", "GMAIL"]);
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(error.mock.calls.flat().join(" ")).toContain("oauth, http");
    error.mockRestore();
  });

  it("refuses HTTP with no api key", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(["tool", "connect", TOOL_ID, "--auth-type", "http"]);
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(error.mock.calls.flat().join(" ")).toContain("--api-key-value");
    error.mockRestore();
  });
});
