import { existsSync, readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMcpForwarder,
  DEFAULT_REQUEST_TIMEOUT_MS,
  LONG_RUNNING_TOOL_TIMEOUT_MS,
  LONG_RUNNING_TOOLS,
  requestTimeoutMs
} from "./proxy";

// Mock the config module so key/url/org resolution is hermetic. Tests that pass
// an explicit apiKey + baseUrl never reach the first two; `resolveOrganizationId`
// IS reached by every test that does not pass an explicit organizationId, which
// is what makes the "no header when nothing selected one" case real.
const mockOrganizationId = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("./config", () => ({
  resolveApiKey: () => {
    throw new Error("No API key found. Set NEXUS_API_KEY or run: nexus-mcp login");
  },
  resolveBaseUrl: () => "http://localhost:1",
  resolveOrganizationId: () => mockOrganizationId.value
}));

/**
 * Exercises the bridge against a REAL http server rather than a stubbed fetch —
 * the transport-round-trip bugs this package is meant to avoid only show up
 * against a real socket (empty notification body, header forwarding, non-2xx
 * bodies). No stdio is hijacked: the forwarder is driven directly.
 */

type CapturedRequest = {
  apiKey: string | undefined;
  organizationId: string | undefined;
  headerNames: string[];
  body: unknown;
  path: string;
};

function startServer(
  respond: (body: { id?: unknown; method?: string }, res: http.ServerResponse) => void
): Promise<{ url: string; requests: CapturedRequest[]; close: () => Promise<void> }> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({
        apiKey: req.headers["api-key"] as string | undefined,
        organizationId: req.headers["organization-id"] as string | undefined,
        headerNames: Object.keys(req.headers),
        body,
        path: req.url ?? ""
      });
      respond(body, res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://localhost:${port}`,
        requests,
        close: () =>
          new Promise<void>((done) => {
            // Force-drop any still-open sockets — the timeout test's server never
            // ends its response, and a bare close() would wait on that connection.
            server.closeAllConnections();
            server.close(() => done());
          })
      });
    });
  });
}

const servers: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (servers.length) await servers.pop()?.close();
  mockOrganizationId.value = undefined;
});

function collect(): { send: (m: JSONRPCMessage) => void; sent: JSONRPCMessage[] } {
  const sent: JSONRPCMessage[] = [];
  return { send: (m) => void sent.push(m), sent };
}

describe("createMcpForwarder", () => {
  it("forwards a request, relays the reply, and sends the api-key header", async () => {
    const server = await startServer((body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [] } }));
    });
    servers.push(server);
    const forward = createMcpForwarder({ baseUrl: server.url, apiKey: "nxs_u_test" });
    const { send, sent } = collect();

    await forward({ jsonrpc: "2.0", id: 1, method: "tools/list" }, send);

    expect(sent).toEqual([{ jsonrpc: "2.0", id: 1, result: { tools: [] } }]);
    expect(server.requests[0].apiKey).toBe("nxs_u_test");
    expect(server.requests[0].body).toMatchObject({ method: "tools/list", id: 1 });
  });

  it("names the organization the profile acts on, so a cross-org key reaches the right tenant", async () => {
    // 🚨 THE REGRESSION THIS PINS (NEX-3022). A personal token (`nxs_p_`) belongs
    // to no organization; the one it acts on is whichever `organization-id`
    // names. Without the header every tool call ran against the server's default
    // while `nexus agent list` in the same shell — same key, same config file —
    // ran against the selected one. Nothing reported the split.
    mockOrganizationId.value = "org_selected";
    const server = await startServer((body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
    });
    servers.push(server);
    const forward = createMcpForwarder({ baseUrl: server.url, apiKey: "nxs_p_test" });
    const { send } = collect();

    await forward({ jsonrpc: "2.0", id: 1, method: "tools/list" }, send);

    expect(server.requests[0].organizationId).toBe("org_selected");
  });

  it("sends NO organization header when nothing selected one", async () => {
    // An org-scoped key reaches exactly one organization by construction, and
    // naming another is refused server-side rather than answered. An empty
    // header is not the same as no header — it would turn a working key into a
    // 4xx on every call.
    const server = await startServer((body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
    });
    servers.push(server);
    const forward = createMcpForwarder({ baseUrl: server.url, apiKey: "nxs_test" });
    const { send } = collect();

    await forward({ jsonrpc: "2.0", id: 1, method: "tools/list" }, send);

    expect(server.requests[0].headerNames).not.toContain("organization-id");
  });

  it("lets an explicit organizationId override what the config resolved", async () => {
    mockOrganizationId.value = "org_from_config";
    const server = await startServer((body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
    });
    servers.push(server);
    const forward = createMcpForwarder({
      baseUrl: server.url,
      apiKey: "k",
      organizationId: "org_explicit"
    });
    const { send } = collect();

    await forward({ jsonrpc: "2.0", id: 1, method: "tools/list" }, send);

    expect(server.requests[0].organizationId).toBe("org_explicit");
  });

  it("posts to /api/public/v1/mcp and collapses a trailing slash on the base url", async () => {
    const server = await startServer((body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
    });
    servers.push(server);
    // Trailing slash on the base url must not double up into `//api/...`.
    const forward = createMcpForwarder({ baseUrl: `${server.url}/`, apiKey: "k" });
    const { send } = collect();

    await forward({ jsonrpc: "2.0", id: 1, method: "initialize" }, send);

    expect(server.requests[0].path).toBe("/api/public/v1/mcp");
  });

  it("does not reply to a notification (no id)", async () => {
    const server = await startServer((_body, res) => {
      res.writeHead(200);
      res.end("");
    });
    servers.push(server);
    const forward = createMcpForwarder({ baseUrl: server.url, apiKey: "k" });
    const { send, sent } = collect();

    await forward({ jsonrpc: "2.0", method: "notifications/initialized" }, send);

    // Forwarded to the server, but nothing sent back to the client.
    expect(server.requests.length).toBe(1);
    expect(sent).toEqual([]);
  });

  it("surfaces a 403 from the api-key guard as a JSON-RPC error, not a raw body", async () => {
    const server = await startServer((_body, res) => {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: false, error: { code: "FORBIDDEN" } }));
    });
    servers.push(server);
    const forward = createMcpForwarder({ baseUrl: server.url, apiKey: "k" });
    const { send, sent } = collect();

    await forward({ jsonrpc: "2.0", id: 5, method: "tools/list" }, send);

    expect(sent).toHaveLength(1);
    const reply = sent[0] as { id: number; error?: { code: number; message: string } };
    expect(reply.id).toBe(5);
    expect(reply.error?.code).toBe(-32002);
    expect(reply.error?.message).toContain("403");
  });

  it("times out a stalled backend as a JSON-RPC error", async () => {
    // Server accepts the request but never responds; the forwarder must abort on
    // its own timeout and reply -32003 rather than hang forever (NEX-1941).
    const server = await startServer(() => {
      /* deliberately never calls res.end */
    });
    servers.push(server);
    process.env.NEXUS_MCP_REQUEST_TIMEOUT_MS = "150";
    try {
      const forward = createMcpForwarder({ baseUrl: server.url, apiKey: "k" });
      const { send, sent } = collect();

      await forward({ jsonrpc: "2.0", id: 11, method: "tools/list" }, send);

      expect(sent).toHaveLength(1);
      const reply = sent[0] as { id: number; error?: { code: number; message: string } };
      expect(reply.id).toBe(11);
      expect(reply.error?.code).toBe(-32003);
      expect(reply.error?.message).toMatch(/timed out/i);
    } finally {
      delete process.env.NEXUS_MCP_REQUEST_TIMEOUT_MS;
    }
  });

  it("cancels an in-flight request and sends no late reply", async () => {
    // Server receives the request but never responds; a notifications/cancelled
    // must abort the fetch so the original request resolves with no reply, rather
    // than emitting one late after the client asked to stop.
    const server = await startServer(() => {
      /* deliberately never responds */
    });
    servers.push(server);
    process.env.NEXUS_MCP_REQUEST_TIMEOUT_MS = "10000"; // long, so cancel (not timeout) wins
    try {
      const forward = createMcpForwarder({ baseUrl: server.url, apiKey: "k" });
      const { send, sent } = collect();

      const pending = forward({ jsonrpc: "2.0", id: 20, method: "tools/call", params: {} }, send);
      await vi.waitFor(() => expect(server.requests.length).toBe(1)); // request is in-flight
      await forward(
        { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 20 } },
        send
      );
      await pending;

      expect(sent).toEqual([]); // no reply for the cancelled request
    } finally {
      delete process.env.NEXUS_MCP_REQUEST_TIMEOUT_MS;
    }
  });

  it("surfaces an unreachable backend as a JSON-RPC error", async () => {
    // Nothing listening on this port.
    const forward = createMcpForwarder({ baseUrl: "http://localhost:1", apiKey: "k" });
    const { send, sent } = collect();

    await forward({ jsonrpc: "2.0", id: 7, method: "tools/list" }, send);

    expect(sent).toHaveLength(1);
    const reply = sent[0] as { id: number; error?: { code: number } };
    expect(reply.id).toBe(7);
    expect(reply.error?.code).toBe(-32603);
  });

  it("reports a missing api key on the request rather than throwing", async () => {
    // No apiKey option → resolveApiKey (mocked to throw) fires; the forwarder
    // must turn that into a reply, not crash the bridge.
    const forward = createMcpForwarder({ baseUrl: "http://localhost:1" });
    const { send, sent } = collect();

    await forward({ jsonrpc: "2.0", id: 9, method: "tools/list" }, send);

    expect(sent).toHaveLength(1);
    const reply = sent[0] as { id: number; error?: { code: number; message: string } };
    expect(reply.error?.code).toBe(-32001);
    expect(reply.error?.message).toMatch(/login|api key/i);
  });
});

/**
 * NEX-2492 — a tool whose route runs a MODEL cannot answer inside the deadline
 * the bridge gives ordinary traffic. `skills_execute_task` on a frontier model
 * with structured JSON output takes 60–90 s; the flat 60 s default landed on the
 * wrong side of that, so the call was reported as a timeout while the server ran
 * the generation to completion and billed it.
 */
describe("the deadline a message runs under", () => {
  it("gives an ordinary message the 60 s default", () => {
    expect(requestTimeoutMs({ jsonrpc: "2.0", id: 1, method: "tools/list" })).toBe(
      DEFAULT_REQUEST_TIMEOUT_MS
    );
  });

  it("gives a long-running tool call the minutes its generation needs", () => {
    const call: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "skills_execute_task", arguments: { taskId: "t", input: "…" } }
    } as JSONRPCMessage;

    expect(requestTimeoutMs(call)).toBe(LONG_RUNNING_TOOL_TIMEOUT_MS);
  });

  it("keeps the default for a tool call that is not long-running", () => {
    const call: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "skills_get_task", arguments: { taskId: "t" } }
    } as JSONRPCMessage;

    expect(requestTimeoutMs(call)).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });

  it("lets NEXUS_MCP_REQUEST_TIMEOUT_MS govern every message, long-running included", () => {
    const call: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "skills_execute_task" }
    } as JSONRPCMessage;

    // An operator-set ceiling that a per-tool default could outlive would not be
    // a ceiling, and the variable exists precisely to bound a wedged backend.
    expect(requestTimeoutMs(call, 150)).toBe(150);
    expect(requestTimeoutMs({ jsonrpc: "2.0", id: 2, method: "tools/list" }, 150)).toBe(150);
  });

  it("does not mistake a malformed tools/call for a long-running one", () => {
    const noName = { jsonrpc: "2.0", id: 1, method: "tools/call", params: {} } as JSONRPCMessage;
    const nonStringName = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: 42 }
    } as unknown as JSONRPCMessage;

    expect(requestTimeoutMs(noName)).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    expect(requestTimeoutMs(nonStringName)).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });
});

/**
 * The names above are the `mcp.name` of a route contract in `@nexus/types`. This
 * package deliberately does not depend on that one — it is a transport bridge and
 * its dependency list is part of the point — so the link is held here instead: a
 * renamed tool makes the set silently stale, and a stale set means the 30 s→60 s
 * class of failure comes back for the one route that most needs the exemption.
 */
describe("the long-running tool names still exist in the route contracts", () => {
  const contractDir = join(
    __dirname,
    "..",
    "..",
    "types",
    "src",
    "api",
    "public",
    "v1",
    "contract"
  );

  it("matches an mcp.name declared by a contract, for every name in the set", () => {
    // Only meaningful inside the monorepo; the published package ships without
    // its siblings, and a missing directory is that case rather than a failure.
    if (!existsSync(contractDir)) return;

    const declared = new Set<string>();
    for (const file of readdirSync(contractDir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const source = readFileSync(join(contractDir, file), "utf8");
      for (const [, name] of source.matchAll(/mcp:\s*\{\s*name:\s*"([^"]+)"/g)) {
        declared.add(name);
      }
    }

    expect(declared.size).toBeGreaterThan(0); // the scan is alive
    expect([...LONG_RUNNING_TOOLS].filter((tool) => !declared.has(tool))).toEqual([]);
  });
});
