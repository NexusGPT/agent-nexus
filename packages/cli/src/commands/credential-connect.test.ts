import { CredentialsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * What `nexus credential connect` puts ON THE WIRE, and which branch it picks.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE REQUEST BODY IS THE ONLY SURFACE WORTH ASSERTING HERE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The command takes no positional argument and no `--auth-type`: the branch is
 * INFERRED from which flag arrived. That is the whole ergonomic — and it is
 * exactly the kind of decision `tsc` cannot see, because both arms typecheck
 * and the wrong one still produces a well-formed request. So each case below
 * drives the real SDK resource over a fake transport and reads the body it
 * built, never a mocked resource.
 *
 * `--api-key-value`, not `--api-key`, and that spelling is load-bearing rather
 * than cosmetic: `--api-key` is a GLOBAL flag on this CLI, so a subcommand
 * declaring it would have the root parser swallow the operator's PROVIDER key
 * and apply it as Nexus transport auth. `util/global-option-shadowing.test.ts`
 * is the gate; this file pins the spelling from the caller's side.
 */

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    credentials: new CredentialsResource({ request } as never)
  })
}));

import { EXIT_CODES } from "../exit-codes";
import { registerCredentialCommands } from "./credential";

const TOOL_ID = "42843f2f-06ca-4a86-bd3e-2752a07968cb";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerCredentialCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

/** The JSON document a local refusal puts on STDOUT under `--json`. */
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

/** The single request the command made: `[method, path, options]`, or null. */
function sentRequest(): { method: string; path: string; body?: unknown } | null {
  if (request.mock.calls.length === 0) return null;
  const [method, path, options] = request.mock.calls[0] as [
    string,
    string,
    { body?: unknown } | undefined
  ];
  return { method, path, body: options?.body };
}

describe("nexus credential connect", () => {
  afterEach(() => {
    setJsonMode(false);
    process.exitCode = undefined;
  });

  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({
      authType: "oauth",
      authorizationUrl: "https://example.com/auth",
      handshakeId: "ctok_abc",
      expiresAt: "2026-01-01T00:00:00.000Z"
    });
    process.exitCode = undefined;
  });

  it("addresses the credential namespace, not a tool", async () => {
    await run(["credential", "connect", "--service", "GMAIL"]);
    // The whole point of the command: no tool id in the path, none in the body.
    expect(sentRequest()).toEqual({
      method: "POST",
      path: "/credentials/connect",
      body: { authType: "oauth", service: "GMAIL" }
    });
  });

  it("infers the API-key branch from --api-key-value and carries the tool in the body", async () => {
    request.mockResolvedValue({
      authType: "api_key",
      credentialId: "22222222-2222-4222-8222-222222222222",
      toolCredentialId: "11111111-1111-4111-8111-111111111111",
      name: "Production key",
      type: "user_http",
      status: "ACTIVE",
      createdAt: "2026-08-19T12:00:00.000Z"
    });

    await run([
      "credential",
      "connect",
      "--tool",
      TOOL_ID,
      "--api-key-value",
      "sk-abc123",
      "--name",
      "Production key"
    ]);

    expect(sentRequest()).toEqual({
      method: "POST",
      path: "/credentials/connect",
      body: {
        authType: "api_key",
        toolId: TOOL_ID,
        apiKey: "sk-abc123",
        name: "Production key"
      }
    });
  });

  it("refuses when neither branch is selected, rather than guessing one", async () => {
    const doc = await refusalDocument(["credential", "connect"]);
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    expect(doc.message).toContain("--service");
    expect(doc.message).toContain("--api-key-value");
    expect(doc.code).toBe("CLI_INVALID_ARGUMENTS");
  });

  it("refuses both branches at once instead of silently preferring one", async () => {
    const doc = await refusalDocument([
      "credential",
      "connect",
      "--service",
      "GMAIL",
      "--tool",
      TOOL_ID,
      "--api-key-value",
      "sk-abc"
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(doc.message).toContain("not both");
    expect(doc.message).toContain("--body");
  });

  it("refuses --api-key-value without --tool, because the key has nowhere to live", async () => {
    const doc = await refusalDocument(["credential", "connect", "--api-key-value", "sk-abc"]);
    expect(request).not.toHaveBeenCalled();
    expect(doc.message).toContain("--tool is required");
    expect(doc.hint).toContain("nexus tool search");
  });

  it("refuses --tool on the OAuth branch rather than dropping it", async () => {
    // Dropping it silently would be worse than refusing: the caller believes
    // the account is being authorized FOR that tool, and it is not.
    const doc = await refusalDocument([
      "credential",
      "connect",
      "--service",
      "GMAIL",
      "--tool",
      TOOL_ID
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(doc.message).toContain("--tool is not accepted with --service");
  });

  it("reads both branches out of --body", async () => {
    await run(["credential", "connect", "--body", '{"authType":"oauth","service":"NOTION"}']);
    expect(sentRequest()?.body).toEqual({ authType: "oauth", service: "NOTION" });
  });

  it("lets an explicit flag win over the same field in --body", async () => {
    await run([
      "credential",
      "connect",
      "--body",
      '{"authType":"oauth","service":"NOTION"}',
      "--service",
      "GMAIL"
    ]);
    expect(sentRequest()?.body).toEqual({ authType: "oauth", service: "GMAIL" });
  });

  it("sends only the fields the API-key arm declares", async () => {
    await run(["credential", "connect", "--tool", TOOL_ID, "--api-key-value", "sk-abc"]);
    expect(sentRequest()?.body).toEqual({
      authType: "api_key",
      toolId: TOOL_ID,
      apiKey: "sk-abc"
    });
  });
});

describe("nexus credential connect-status", () => {
  afterEach(() => {
    setJsonMode(false);
    process.exitCode = undefined;
  });

  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({
      status: "PENDING",
      connectionId: null,
      errorMessage: null,
      errorCode: null,
      expiresAt: null
    });
    process.exitCode = undefined;
  });

  it("polls the credential namespace, and accepts a non-uuid Pipedream token", async () => {
    await run(["credential", "connect-status", "ctok_dac4453f92a54ae7ac45e23694cc4a78"]);
    expect(sentRequest()).toEqual({
      method: "GET",
      path: "/credentials/connect/ctok_dac4453f92a54ae7ac45e23694cc4a78",
      body: undefined
    });
  });
});
