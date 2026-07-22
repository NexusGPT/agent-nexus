import http from "node:http";
import type { AddressInfo } from "node:net";

import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMcpForwarder } from "./proxy";

// Mock the config module so key/url resolution is hermetic. Tests that pass an
// explicit apiKey + baseUrl never reach these; only the missing-key test does.
vi.mock("./config", () => ({
  resolveApiKey: () => {
    throw new Error("No API key found. Set NEXUS_API_KEY or run: nexus-mcp login");
  },
  resolveBaseUrl: () => "http://localhost:1"
}));

/**
 * Exercises the bridge against a REAL http server rather than a stubbed fetch —
 * the transport-round-trip bugs this package is meant to avoid only show up
 * against a real socket (empty notification body, header forwarding, non-2xx
 * bodies). No stdio is hijacked: the forwarder is driven directly.
 */

type CapturedRequest = { apiKey: string | undefined; body: unknown; path: string };

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
