import { NexusApiError } from "@agent-nexus/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createBridgeForwarder,
  createMcpTransport,
  type JsonRpcResponse,
  type McpCallResult,
  readCallPayload,
  readCallResult,
  readToolList,
  toolsCallMessage,
  toolsListMessage
} from "./mcp-rpc";

/**
 * THE PARITY THIS MODULE EXISTS FOR, ASSERTED ON THE WIRE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE ORGANIZATION HEADER IS THE LOAD-BEARING CASE (NEX-3022)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `@agent-nexus/mcp-server` resolves a key — `NEXUS_API_KEY`, else the active
 * profile — and sends `api-key` and nothing else. A personal cross-org token
 * (`nxs_p_`) carries NO organization of its own: the org is whatever the
 * `organization-id` header names, and `nexus auth use-org` is what sets it. So
 * the bridge drove MCP against the server's default organization while every
 * other command in the same shell, holding the SAME key, acted on the selected
 * one. Nothing on either side reported the divergence, and the failure is silent
 * in the worst direction — reads answer from another tenant, writes land in it.
 *
 * A test that only checked "the request was sent" would have passed throughout.
 * These assert the HEADERS, in both directions: present when an organization is
 * selected, ABSENT when none is, because sending an empty or guessed one is how
 * an org-scoped key starts getting refused with ORG_SCOPED_KEY_ORG_MISMATCH.
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

interface Captured {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly signal: AbortSignal | undefined;
}

/** Record every request and answer with one canned response. */
function captureFetch(response: { status: number; body: string }): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[key.toLowerCase()] = value;
    }
    calls.push({
      url: String(input),
      headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      signal: init?.signal ?? undefined
    });
    return new Response(response.body === "" ? null : response.body, {
      status: response.status,
      headers: { "content-type": "application/json" }
    });
  }) as typeof globalThis.fetch;
  return calls;
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  realFetch = globalThis.fetch;
  // An explicit key means `resolveProfile` never reads the config file, so this
  // suite is a function of its own inputs and not of the machine's profiles.
  process.env.NEXUS_API_KEY = "nxs_p_test";
  process.env.NEXUS_BASE_URL = "https://api.example.invalid";
  delete process.env.NEXUS_ORGANIZATION_ID;
  delete process.env.NEXUS_PROFILE;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  globalThis.fetch = realFetch;
});

describe("the MCP transport speaks the CLI's own credential resolution", () => {
  it("posts the JSON-RPC message to the v1 MCP endpoint with the resolved key", async () => {
    const calls = captureFetch({
      status: 201,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } })
    });

    const transport = createMcpTransport({});
    const reply = await transport.send(toolsListMessage(1));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.example.invalid/api/public/v1/mcp");
    expect(calls[0].headers["api-key"]).toBe("nxs_p_test");
    expect(calls[0].body).toEqual({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(reply?.result).toEqual({ tools: [] });
    expect(transport.target.url).toBe("https://api.example.invalid/api/public/v1/mcp");
  });

  it("carries the organization every other command acts on", async () => {
    process.env.NEXUS_ORGANIZATION_ID = "org_selected";
    const calls = captureFetch({
      status: 201,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })
    });

    const transport = createMcpTransport({});
    await transport.send(toolsCallMessage(1, "identity_whoami", {}));

    expect(calls[0].headers["organization-id"]).toBe("org_selected");
    expect(transport.target.organizationId).toBe("org_selected");
  });

  it("sends NO organization header when nothing selected one", async () => {
    const calls = captureFetch({
      status: 201,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })
    });

    await createMcpTransport({}).send(toolsListMessage(1));

    // An org-scoped key reaches exactly one organization by construction, and
    // naming another is refused server-side rather than answered. Sending a
    // guessed header would turn a working key into a 4xx.
    expect(Object.keys(calls[0].headers)).not.toContain("organization-id");
  });

  it("reads a notification's empty 201 as no reply, never as a malformed one", async () => {
    captureFetch({ status: 201, body: "" });

    const reply = await createMcpTransport({}).send({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    });

    // A reply invented here would reach a stdio client as a response to an id it
    // never sent, which is what breaks a host's transport.
    expect(reply).toBeNull();
  });

  it("hands a caller's cancellation through to the request in flight", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      controller.abort();
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }) as typeof globalThis.fetch;

    await createMcpTransport({}).send(toolsListMessage(1), controller.signal);

    // Not `controller.signal` — the one the request actually carries is the
    // LINKED signal, and asserting on the caller's own would pass even if the
    // link were never made.
    expect(seen).toBeDefined();
    expect(seen).not.toBe(controller.signal);
    expect(seen?.aborted).toBe(true);
  });

  it("does not replay a failed tools/call", async () => {
    // POST is outside the SDK's idempotent set, so a 502 is surfaced rather than
    // retried. A replayed tool call runs the tool twice.
    const calls = captureFetch({ status: 502, body: JSON.stringify({ message: "bad gateway" }) });

    await expect(
      createMcpTransport({}).send(toolsCallMessage(1, "agent_create", {}))
    ).rejects.toThrow(NexusApiError);
    expect(calls).toHaveLength(1);
  });
});

describe("reading a tools/list reply", () => {
  it("returns the tools when the shape is what the endpoint promised", () => {
    expect(readToolList({ tools: [{ name: "agent_list" }] })).toEqual([{ name: "agent_list" }]);
  });

  it("says nothing rather than guessing when there is no tools array", () => {
    // The caller reports this as a failure. Returning [] here would print an
    // empty table, which reads exactly like "this key has no tools".
    expect(readToolList({})).toBeUndefined();
    expect(readToolList(null)).toBeUndefined();
    expect(readToolList({ tools: "all of them" })).toBeUndefined();
  });

  it("drops an entry with no name rather than printing an undefined row", () => {
    expect(readToolList({ tools: [{ name: "ok" }, { description: "no name" }] })).toEqual([
      { name: "ok" }
    ]);
  });
});

describe("the forwarder the stdio bridge runs on", () => {
  const transportThatAnswers = (
    reply: JsonRpcResponse | null,
    error?: Error
  ): Parameters<typeof createBridgeForwarder>[0] => ({
    target: {
      url: "https://api.example.invalid/api/public/v1/mcp",
      profileName: "p",
      profileSource: "active",
      keyIsCrossOrg: false
    },
    send: async () => {
      if (error) throw error;
      return reply;
    }
  });

  it("passes a real reply straight through", async () => {
    const reply: JsonRpcResponse = { jsonrpc: "2.0", id: 1, result: { tools: [] } };
    const forward = createBridgeForwarder(transportThatAnswers(reply));

    await expect(
      forward({ jsonrpc: "2.0", id: 1, method: "tools/list" }, new AbortController().signal)
    ).resolves.toBe(reply);
  });

  it("ANSWERS a request whose 2xx body was not a JSON-RPC document", async () => {
    // 🚨 The regression this pins. `send` returns null for a notification AND for
    // an empty / non-JSON-RPC 2xx — a gateway's 204, a proxy interstitial.
    // Forwarding the second as "no reply" leaves the request id unanswered
    // forever, and the host has no timeout of its own: the user sees the
    // assistant stop mid-response with nothing logged anywhere.
    const forward = createBridgeForwarder(transportThatAnswers(null));

    const reply = await forward(
      { jsonrpc: "2.0", id: 7, method: "tools/call" },
      new AbortController().signal
    );

    expect(reply?.id).toBe(7);
    expect(reply?.error?.code).toBe(-32002);
    expect(reply?.error?.message).toContain("tools/call");
  });

  it("still answers NOTHING to a notification, whatever the body was", async () => {
    const forward = createBridgeForwarder(transportThatAnswers(null));

    await expect(
      forward({ jsonrpc: "2.0", method: "notifications/initialized" }, new AbortController().signal)
    ).resolves.toBeNull();
  });

  it("drops a JSON-RPC document the endpoint answered a NOTIFICATION with", async () => {
    // 🚨 The other half of the same rule. The endpoint refuses a malformed
    // envelope with `jsonRpcError(null, …)` BEFORE it looks at whether the
    // message carried an id, so a notification can come back with a JSON-RPC
    // document rather than the empty 201. Passing it on puts a reply on stdout
    // for an id the host never sent, which breaks the transport for every other
    // message in flight.
    const forward = createBridgeForwarder(
      transportThatAnswers({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" }
      })
    );

    await expect(
      forward({ jsonrpc: "2.0", method: "notifications/initialized" }, new AbortController().signal)
    ).resolves.toBeNull();
  });

  it("turns a transport failure into an error on the id, not a dropped message", async () => {
    const forward = createBridgeForwarder(
      transportThatAnswers(null, new Error("connection refused"))
    );

    const reply = await forward(
      { jsonrpc: "2.0", id: 3, method: "ping" },
      new AbortController().signal
    );

    expect(reply?.id).toBe(3);
    expect(reply?.error?.message).toContain("connection refused");
  });

  it("says nothing when a NOTIFICATION's request fails", async () => {
    const forward = createBridgeForwarder(transportThatAnswers(null, new Error("boom")));

    await expect(
      forward({ jsonrpc: "2.0", method: "notifications/cancelled" }, new AbortController().signal)
    ).resolves.toBeNull();
  });
});

describe("reading the tools/call envelope", () => {
  it("keeps isError only when it is literally true", () => {
    // A cast would make "the server sent something unexpected" read as "the tool
    // succeeded" — the one wrong answer a caller cannot detect, because the exit
    // code and the payload both look like success.
    expect(readCallResult({ isError: true }).isError).toBe(true);
    expect(readCallResult({ isError: "true" }).isError).toBeUndefined();
    expect(readCallResult({ isError: 1 }).isError).toBeUndefined();
    expect(readCallResult({}).isError).toBeUndefined();
  });

  it("survives a body that is not an envelope at all", () => {
    expect(readCallResult(null)).toEqual({});
    expect(readCallResult("a string")).toEqual({});
    expect(readCallResult({ content: "not an array" })).toEqual({});
  });

  it("drops content entries that are not blocks", () => {
    expect(readCallResult({ content: [{ type: "text", text: "a" }, null, 7] })).toEqual({
      content: [{ type: "text", text: "a" }]
    });
  });
});

describe("reading a tools/call result", () => {
  const payload: McpCallResult = {
    content: [{ type: "text", text: '{"data":[{"id":"a"}]}' }]
  };

  it("re-parses the single JSON text block, so the output IS the document", () => {
    expect(readCallPayload(payload)).toEqual({ data: [{ id: "a" }] });
  });

  it("hands back plain text unchanged when the block is not JSON", () => {
    expect(readCallPayload({ content: [{ type: "text", text: "not json" }] })).toBe("not json");
  });

  it("falls back to the whole result when there is not exactly one text block", () => {
    const two: McpCallResult = {
      content: [
        { type: "text", text: "{}" },
        { type: "text", text: "{}" }
      ]
    };
    expect(readCallPayload(two)).toBe(two);
    expect(readCallPayload({ content: [] })).toEqual({ content: [] });
  });
});
