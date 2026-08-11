import { describe, expect, it, vi } from "vitest";

import { NexusApiError, NexusAuthenticationError, NexusConnectionError } from "./errors";
import { HttpClient, withDerivedHasMore } from "./http-client";

/**
 * NEX-3021 — the client decided success from the BODY (`json.success`) instead
 * of the HTTP status, so every 2xx response that is not a v1 envelope was
 * reported as `Request failed with status 201` and its body thrown away. That
 * made `POST /mcp` — JSON-RPC 2.0, answered 201 by Nest, and the only endpoint
 * with no typed command — unreachable through `nexus api`.
 */

/** A stub `fetch` that answers once with the given status/body. */
function stubFetch(status: number, body?: string, headers?: Record<string, string>) {
  const fetchFn = vi.fn(async () =>
    body === undefined
      ? new Response(null, { status })
      : new Response(body, { status, headers: { "content-type": "application/json", ...headers } })
  );
  return fetchFn as unknown as typeof globalThis.fetch;
}

function clientFor(status: number, body?: string): HttpClient {
  return new HttpClient({
    baseUrl: "https://api.nexusgpt.io",
    apiKey: "nxs_test",
    fetch: stubFetch(status, body)
  });
}

const JSON_RPC_TOOLS = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  result: { tools: [{ name: "identity_whoami", description: "who am I" }] }
});

describe("requestWithMeta — the HTTP status decides success", () => {
  it("returns a 201 JSON-RPC body verbatim instead of throwing (NEX-3021)", async () => {
    const http = clientFor(201, JSON_RPC_TOOLS);

    const { data, meta } = await http.requestWithMeta<Record<string, unknown>>("POST", "/mcp", {
      body: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
    });

    expect(data).toEqual(JSON.parse(JSON_RPC_TOOLS));
    expect(meta).toBeUndefined();
  });

  it("returns a JSON-RPC *error* result as data — it is the endpoint's answer, not a transport failure", async () => {
    const rpcError = { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Unknown method" } };
    const http = clientFor(201, JSON.stringify(rpcError));

    await expect(http.requestWithMeta("POST", "/mcp", { body: {} })).resolves.toEqual({
      data: rpcError,
      meta: undefined
    });
  });

  it("treats an empty 201 body as success — a JSON-RPC notification is answered with nothing", async () => {
    const http = clientFor(201, "");

    await expect(
      http.requestWithMeta("POST", "/mcp", {
        body: { jsonrpc: "2.0", method: "notifications/initialized" }
      })
    ).resolves.toEqual({ data: {}, meta: undefined });
  });

  it("still unwraps the standard success envelope, meta included", async () => {
    const http = clientFor(
      200,
      JSON.stringify({
        success: true,
        data: [{ id: "a" }],
        meta: { total: 1, page: 1, hasMore: false }
      })
    );

    await expect(http.requestWithMeta("GET", "/agents")).resolves.toEqual({
      data: [{ id: "a" }],
      meta: { total: 1, page: 1, hasMore: false }
    });
  });

  it("still returns {} for 204 No Content", async () => {
    const http = clientFor(204);

    await expect(http.requestWithMeta("DELETE", "/agents/a")).resolves.toEqual({
      data: {},
      meta: undefined
    });
  });

  it("honors an explicit success:false even on a 2xx", async () => {
    const http = clientFor(
      200,
      JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "gone" } })
    );

    await expect(http.requestWithMeta("GET", "/agents/a")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "gone",
      status: 200
    });
  });
});

describe("requestWithMeta — failures keep reporting what the server said", () => {
  it("surfaces the v1 error envelope's code, message and details", async () => {
    const http = clientFor(
      422,
      JSON.stringify({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "bad input", details: { field: "name" } }
      })
    );

    const err = await http.requestWithMeta("POST", "/agents", { body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(NexusApiError);
    expect(err).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "bad input",
      status: 422,
      details: { field: "name" }
    });
  });

  it("surfaces a NestJS default error body", async () => {
    const http = clientFor(
      404,
      JSON.stringify({ statusCode: 404, message: "Cannot GET /nope", error: "Not Found" })
    );

    await expect(http.requestWithMeta("GET", "/nope")).rejects.toMatchObject({
      code: "Not Found",
      message: "Cannot GET /nope",
      status: 404
    });
  });

  it("throws NexusAuthenticationError on 401, carrying the server's message", async () => {
    const http = clientFor(
      401,
      JSON.stringify({
        success: false,
        error: { code: "INVALID_API_KEY", message: "Invalid API key" }
      })
    );

    const err = await http.requestWithMeta("GET", "/agents").catch((e) => e);
    expect(err).toBeInstanceOf(NexusAuthenticationError);
    expect(err.message).toBe("Invalid API key");
  });

  it("reports the status when a failed response carries no body at all", async () => {
    const http = clientFor(502, "");

    await expect(http.requestWithMeta("GET", "/agents")).rejects.toMatchObject({
      code: "HTTP_502",
      message: "Request failed with status 502",
      status: 502
    });
  });

  it("reports a parse failure when a body is not JSON", async () => {
    const http = clientFor(200, "<html>nope</html>");

    await expect(http.requestWithMeta("GET", "/agents")).rejects.toMatchObject({
      code: "PARSE_ERROR",
      status: 200
    });
  });

  it("does not crash on a 2xx body of literal null", async () => {
    // Reading `.success` off a parsed `null` used to throw a raw TypeError.
    const http = clientFor(200, "null");

    await expect(http.requestWithMeta("GET", "/agents")).resolves.toEqual({
      data: null,
      meta: undefined
    });
  });

  it("reports a body that fails mid-read as a connection error", async () => {
    const broken = {
      status: 200,
      ok: true,
      text: async () => {
        throw new TypeError("terminated");
      }
    } as unknown as Response;
    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      fetch: (async () => broken) as unknown as typeof globalThis.fetch
    });

    const err = await http.requestWithMeta("GET", "/agents").catch((e) => e);
    expect(err).toBeInstanceOf(NexusConnectionError);
    expect(err.message).toBe("terminated");
  });
});

describe("requestRaw", () => {
  it("sends the request body it was given", async () => {
    const fetchFn = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("ok", { status: 200 })
    );
    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      fetch: fetchFn as unknown as typeof globalThis.fetch
    });

    await http.requestRaw("POST", "/analytics/export", { body: { from: "2026-01-01" } });

    const init = fetchFn.mock.calls[0][1];
    expect(init?.body).toBe(JSON.stringify({ from: "2026-01-01" }));
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns the raw text on success", async () => {
    const http = clientFor(200, "id,name\n1,a");

    await expect(http.requestRaw("GET", "/analytics/export")).resolves.toBe("id,name\n1,a");
  });

  it("surfaces the server's error message instead of discarding the body", async () => {
    const http = clientFor(
      403,
      JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "scope missing" } })
    );

    await expect(http.requestRaw("GET", "/analytics/export")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "scope missing",
      status: 403
    });
  });
});

/**
 * `withDerivedHasMore` fills in a `hasMore` the server did not send.
 *
 * The property that matters most is the FIRST test: today every v1 list
 * endpoint sends `hasMore`, so the derivation must be a no-op on real traffic.
 * A helper that "helpfully" recomputed the field would silently disagree with
 * the server on exactly the paginated reads it is supposed to pass through.
 */
describe("withDerivedHasMore", () => {
  it("returns a served hasMore untouched, even when it contradicts the other fields", () => {
    // page 1 of 9 pages says "more pages exist", the server says false.
    // The server wins: it is the only party that knows.
    const meta = { total: 90, page: 1, limit: 10, totalPages: 9, hasMore: false };

    expect(withDerivedHasMore(meta).hasMore).toBe(false);
  });

  it("keeps a served hasMore: true", () => {
    expect(withDerivedHasMore({ total: 90, page: 1, hasMore: true }).hasMore).toBe(true);
  });

  it("derives from page < totalPages when hasMore is absent", () => {
    expect(withDerivedHasMore({ total: 90, page: 1, limit: 10, totalPages: 9 }).hasMore).toBe(true);
    expect(withDerivedHasMore({ total: 90, page: 9, limit: 10, totalPages: 9 }).hasMore).toBe(
      false
    );
  });

  it("falls back to page * limit < total when totalPages is absent too", () => {
    expect(withDerivedHasMore({ total: 90, page: 1, limit: 10 }).hasMore).toBe(true);
    expect(withDerivedHasMore({ total: 90, page: 9, limit: 10 }).hasMore).toBe(false);
  });

  it("answers false when nothing in the payload suggests another page", () => {
    expect(withDerivedHasMore({ total: 90, page: 1 }).hasMore).toBe(false);
  });

  it("preserves every other field it passes through", () => {
    const meta = { total: 90, page: 2, limit: 10, totalPages: 9 };

    expect(withDerivedHasMore(meta)).toEqual({
      total: 90,
      page: 2,
      limit: 10,
      totalPages: 9,
      hasMore: true
    });
  });
});
