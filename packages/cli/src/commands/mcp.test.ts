import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Command } from "commander";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { setJsonMode } from "../output";

/**
 * `nexus mcp` DRIVEN THROUGH THE REAL ROOT PROGRAM.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE ONE BEHAVIOUR THAT NEEDS A GATE RATHER THAN A DOCBLOCK
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `tools/call` reports a refusal from the route it dispatches — a 403, a
 * validation failure — as `isError: true` on a SUCCESSFUL JSON-RPC reply, with
 * HTTP 201 the whole way. That is correct for MCP: a model needs to SEE the
 * refusal to correct its next attempt. It is the exact shape the root epilogue
 * warns about — "A 2xx IS NOT ALWAYS THE THING HAPPENING" — and reading it as
 * success would exit 0 with the error body on stdout, which no script can
 * distinguish from the call working.
 *
 * So the assertions below are about the CONTRACT a caller reads: the exit code,
 * and that exactly one document lands on stdout in each direction.
 *
 * The program is the real `buildRootProgram()` rather than a hand-built one, so
 * the global flags, the pre-action hook and the argument-refusal funnel are the
 * ones the binary parses with.
 */

const ENV_KEYS = [
  "NEXUS_API_KEY",
  "NEXUS_BASE_URL",
  "NEXUS_ORGANIZATION_ID",
  "NEXUS_PROFILE",
  "NEXUS_ENV"
] as const;

let saved: Record<string, string | undefined>;
let realFetch: typeof globalThis.fetch;
let realLog: typeof console.log;
let stdout: string[];
let buildRootProgram: (version?: string) => Command;

/**
 * A HOME OF THIS SUITE'S OWN, AND WHY THE IMPORT IS DEFERRED TO GET IT.
 *
 * `config.ts` resolves `~/.nexus-mcp/config.json` ONCE, at module load. A
 * statically imported root program therefore binds to whichever profiles the
 * machine running the suite happens to have — 8 of them here, none on CI — so
 * the pin case would pass locally and fail there, or worse, read a real key.
 * Setting `HOME` before the first import of that module is what makes the
 * profile below the only one that exists.
 */
beforeAll(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-mcp-cmd-"));
  fs.mkdirSync(path.join(home, ".nexus-mcp"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".nexus-mcp", "config.json"),
    JSON.stringify({
      activeProfile: "acme",
      profiles: { acme: { apiKey: "nxs_profile_key", baseUrl: "https://api.example.invalid" } }
    })
  );
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  ({ buildRootProgram } = await import("../root-program"));
});

/** Answer every request with one JSON-RPC document. */
function replyWith(result: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      status: 201,
      headers: { "content-type": "application/json" }
    })) as typeof globalThis.fetch;
}

async function run(argv: string[]): Promise<{ out: string; exitCode: number | undefined }> {
  process.exitCode = undefined;
  stdout = [];
  await buildRootProgram().parseAsync(argv, { from: "user" });
  const code = process.exitCode;
  process.exitCode = undefined;
  return { out: stdout.join("\n"), exitCode: code };
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.NEXUS_API_KEY = "nxs_test";
  process.env.NEXUS_BASE_URL = "https://api.example.invalid";
  delete process.env.NEXUS_ORGANIZATION_ID;
  delete process.env.NEXUS_PROFILE;

  realFetch = globalThis.fetch;
  realLog = console.log;
  console.log = (...args: unknown[]): void => void stdout.push(args.map(String).join(" "));
  setJsonMode(true);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  globalThis.fetch = realFetch;
  console.log = realLog;
  setJsonMode(false);
});

describe("nexus mcp call", () => {
  it("prints the tool's own payload, unwrapped from the text block", async () => {
    replyWith({ content: [{ type: "text", text: '{"data":[{"id":"agent-1"}]}' }] });

    const { out, exitCode } = await run(["mcp", "call", "agent_list", "--json"]);

    expect(exitCode).toBeUndefined();
    expect(JSON.parse(out)).toEqual({ data: [{ id: "agent-1" }] });
  });

  it("prints the JSON-RPC result verbatim under --raw", async () => {
    const result = { content: [{ type: "text", text: '{"ok":true}' }], isError: false };
    replyWith(result);

    const { out } = await run(["mcp", "call", "identity_whoami", "--raw", "--json"]);

    expect(JSON.parse(out)).toEqual(result);
  });

  it("EXITS 1 when the tool reports an error on a 2xx reply", async () => {
    replyWith({
      content: [{ type: "text", text: '{"message":"Forbidden: missing agent:write"}' }],
      isError: true
    });

    const { out, exitCode } = await run(["mcp", "call", "agent_create", "--json"]);

    expect(exitCode).toBe(1);
    const document = JSON.parse(out) as { error: { message: string; code: string } };
    // One document, and it carries the server's own words — a caller that only
    // reads the exit code still gets told what to fix.
    expect(document.error.code).toBe("CLI_REMOTE_ERROR");
    expect(document.error.message).toContain("missing agent:write");
  });

  it("EXITS 1 on a JSON-RPC error, naming the numeric code", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32602, message: "Unknown tool: agent_lst" }
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      )) as typeof globalThis.fetch;

    const { out, exitCode } = await run(["mcp", "call", "agent_lst", "--json"]);

    expect(exitCode).toBe(1);
    const document = JSON.parse(out) as { error: { message: string } };
    expect(document.error.message).toContain("Unknown tool: agent_lst");
    expect(document.error.message).toContain("-32602");
  });

  it("refuses a non-object --input before anything leaves this process", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return new Response("{}", { status: 201 });
    }) as typeof globalThis.fetch;

    const { out, exitCode } = await run(["mcp", "call", "agent_list", "--input", "[1]", "--json"]);

    expect(exitCode).toBe(1);
    expect(requests).toBe(0);
    expect((JSON.parse(out) as { error: { code: string } }).error.code).toBe(
      "CLI_INVALID_ARGUMENTS"
    );
  });

  it("refuses invalid JSON in --input", async () => {
    const { exitCode } = await run(["mcp", "call", "agent_list", "--input", "{oops", "--json"]);
    expect(exitCode).toBe(1);
  });

  it("EXITS 1 on a reply carrying neither result nor error", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1 }), {
        status: 201,
        headers: { "content-type": "application/json" }
      })) as typeof globalThis.fetch;

    const { out, exitCode } = await run(["mcp", "call", "identity_whoami", "--json"]);

    // JSON-RPC 2.0 requires exactly one of the two. Treating the absence as a
    // value would exit 0 having printed nothing — the single outcome a caller
    // cannot tell apart from the command working.
    expect(exitCode).toBe(1);
    expect((JSON.parse(out) as { error: { code: string } }).error.code).toBe("CLI_REMOTE_ERROR");
  });
});

describe("nexus mcp tools list", () => {
  const catalog = {
    tools: [
      {
        name: "agent_list",
        description: "List agents",
        inputSchema: {},
        annotations: { readOnlyHint: true, destructiveHint: false }
      },
      {
        name: "workflow_delete",
        description: "Delete a workflow",
        inputSchema: {},
        annotations: { readOnlyHint: false, destructiveHint: true }
      }
    ]
  };

  it("emits every tool the key can see, with its hints", async () => {
    replyWith(catalog);

    const { out, exitCode } = await run(["mcp", "tools", "list", "--json"]);

    expect(exitCode).toBeUndefined();
    const rows = JSON.parse(out) as { name: string; destructive: boolean }[];
    expect(rows.map((row) => row.name)).toEqual(["agent_list", "workflow_delete"]);
    expect(rows[1].destructive).toBe(true);
  });

  it("narrows on --filter without asking the server a second question", async () => {
    replyWith(catalog);

    const { out } = await run(["mcp", "tools", "list", "--filter", "WORKFLOW", "--json"]);

    // Case-insensitive, and matched against name and description alike.
    expect((JSON.parse(out) as { name: string }[]).map((row) => row.name)).toEqual([
      "workflow_delete"
    ]);
  });

  it("fails rather than printing an empty table when the reply has no tools array", async () => {
    replyWith({ notATool: true });

    const { out, exitCode } = await run(["mcp", "tools", "list", "--json"]);

    // An empty table would read exactly like "this key has no tools", which is a
    // legitimate answer this one is not.
    expect(exitCode).toBe(1);
    expect((JSON.parse(out) as { error: { code: string } }).error.code).toBe("CLI_REMOTE_ERROR");
  });

  it("treats a genuinely empty catalog as a result, not a failure", async () => {
    replyWith({ tools: [] });

    const { out, exitCode } = await run(["mcp", "tools", "list", "--json"]);

    expect(exitCode).toBeUndefined();
    expect(JSON.parse(out)).toEqual([]);
  });
});

describe("nexus mcp tools get", () => {
  it("prints the tool's input schema", async () => {
    replyWith({
      tools: [
        {
          name: "agent_get",
          description: "Get an agent",
          inputSchema: { type: "object", properties: { agentId: { type: "string" } } }
        }
      ]
    });

    const { out, exitCode } = await run(["mcp", "tools", "get", "agent_get", "--json"]);

    expect(exitCode).toBeUndefined();
    expect((JSON.parse(out) as { inputSchema: unknown }).inputSchema).toEqual({
      type: "object",
      properties: { agentId: { type: "string" } }
    });
  });

  it("EXITS 1 on a name this key cannot see", async () => {
    replyWith({ tools: [{ name: "agent_get", description: "", inputSchema: {} }] });

    const { out, exitCode } = await run(["mcp", "tools", "get", "agent_delete", "--json"]);

    expect(exitCode).toBe(1);
    expect((JSON.parse(out) as { error: { code: string } }).error.code).toBe("CLI_NOT_FOUND");
  });
});

describe("nexus mcp install", () => {
  it("emits a block that launches this CLI on a PINNED profile, with no key in it", async () => {
    // No key override, so resolution reaches the profile in this suite's own
    // config — which is the case a host config must be able to name.
    delete process.env.NEXUS_API_KEY;

    const { out, exitCode } = await run(["mcp", "install", "--client", "cursor", "--json"]);

    expect(exitCode).toBeUndefined();
    const document = JSON.parse(out) as {
      applied: boolean;
      configPath: string;
      config: { mcpServers: Record<string, { command: string; args: string[] }> };
    };
    expect(document.applied).toBe(false);
    expect(document.configPath).toContain(".cursor");
    expect(document.config.mcpServers.nexus.command).toBe("nexus");
    // No --base-url: the profile carries its own, so pinning the profile name is
    // the whole of what the host needs.
    expect(document.config.mcpServers.nexus.args).toEqual(["mcp", "serve", "--profile", "acme"]);
    // The credential stays where the CLI keeps it. A block carrying one is what
    // this command exists to stop being necessary.
    expect(out).not.toContain("nxs_");
  });

  it("refuses to pin when the invocation is running on a bare key override", async () => {
    // `NEXUS_API_KEY` resolves to source "override", which is not a profile and
    // therefore not something a host config can name. Emitting a block that
    // silently followed whatever profile happened to be active later is the
    // failure this refusal prevents.
    const { out, exitCode } = await run(["mcp", "install", "--json"]);

    expect(exitCode).toBe(1);
    expect((JSON.parse(out) as { error: { message: string } }).error.message).toContain(
      "no profile to pin"
    );
  });

  it("reports a refused write as a LOCAL failure, not an unknown one", async () => {
    delete process.env.NEXUS_API_KEY;

    // `--client cursor` writes under this suite's own HOME, so nothing outside
    // the temporary directory is touched.
    const first = await run(["mcp", "install", "--client", "cursor", "--apply", "--json"]);
    expect(first.exitCode).toBeUndefined();

    const second = await run(["mcp", "install", "--client", "cursor", "--apply", "--json"]);
    const document = JSON.parse(second.out) as { error: { code: string; message: string } };

    expect(second.exitCode).toBe(1);
    // CLI_UNKNOWN_ERROR would tell a script nothing about whether anything left
    // this process. Nothing did: the write was refused on this machine.
    expect(document.error.code).toBe("CLI_LOCAL_FAILED");
    expect(document.error.message).toContain("already configured");

    const forced = await run([
      "mcp",
      "install",
      "--client",
      "cursor",
      "--apply",
      "--force",
      "--json"
    ]);
    expect(forced.exitCode).toBeUndefined();
  });

  it("emits a block that follows the active profile under --no-pin", async () => {
    const { out, exitCode } = await run(["mcp", "install", "--no-pin", "--json"]);

    expect(exitCode).toBeUndefined();
    const document = JSON.parse(out) as {
      config: { mcpServers: Record<string, { args: string[] }> };
    };
    expect(document.config.mcpServers.nexus.args).toEqual(["mcp", "serve"]);
  });
});
