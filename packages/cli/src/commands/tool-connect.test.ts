import { ToolConnectionResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

/**
 * The JSON document a refusal puts on STDOUT, under `--json`.
 *
 * These three cases used to read `console.error`, because a local refusal wrote
 * prose to stderr and left stdout empty — which is the defect the error-document
 * clause closed. `refuse()` now emits the standard
 * `{"error":{"message","hint","code"}}` envelope, so the assertion moves to the
 * channel a caller actually parses and gets stricter: the shape is checked, not
 * only the words.
 */
async function refusalDocument(argv: string[]): Promise<{
  message: string;
  hint: string | null;
  code: string;
}> {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await run(argv);
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
  const parsed = JSON.parse(lines.join("\n")) as {
    error: { message: string; hint: string | null; code: string };
  };
  return parsed.error;
}

/** The body of the single request the command made, or null if it made none. */
function sentBody(): unknown {
  if (request.mock.calls.length === 0) return null;
  const [, , options] = request.mock.calls[0] as [string, string, { body?: unknown }];
  return options.body;
}

describe("nexus tool connect", () => {
  // The file drives every case in JSON mode and several set a failing exit
  // code. Neither was ever put back, so both leaked into whatever ran next.
  afterEach(() => {
    setJsonMode(false);
    process.exitCode = undefined;
  });

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
    const doc = await refusalDocument(["tool", "connect", TOOL_ID]);
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(doc.message).toContain("--service");
    // The example belongs in the hint, where a caller reads it, rather than
    // glued onto the message a script surfaces.
    expect(doc.hint).toContain("--service <service>");
    expect(doc.code).toBe("CLI_INVALID_ARGUMENTS");
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
    const doc = await refusalDocument([
      "tool",
      "connect",
      TOOL_ID,
      "--auth-type",
      "basic",
      "--service",
      "GMAIL"
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(doc.message).toContain("oauth, http");
    expect(doc.code).toBe("CLI_INVALID_ARGUMENTS");
  });

  it("refuses HTTP with no api key", async () => {
    const doc = await refusalDocument(["tool", "connect", TOOL_ID, "--auth-type", "http"]);
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(doc.message).toContain("--api-key-value");
    expect(doc.code).toBe("CLI_INVALID_ARGUMENTS");
  });
});
