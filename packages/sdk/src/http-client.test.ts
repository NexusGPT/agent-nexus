import { describe, expect, it, vi } from "vitest";

import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError
} from "./errors";
import { HttpClient, retryDelayMs, withDerivedHasMore } from "./http-client";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "./timeouts";

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

/**
 * Transient-failure retry.
 *
 * `CLI: E2E flows` went red about 3% of runs against staging with
 * `API error (502): Failed to parse response body (status 502)`. Measured over
 * every failure since 2026-08-05: the 502-class ones land 0.7–2.6 minutes AFTER
 * a staging `porter-deploy` job reports success, never during one, and always on
 * the longest-running call in the flow. The 502 body is not JSON, which is what
 * puts it at the edge proxy rather than in the application.
 *
 * The retry below covers that for idempotent calls. The call that actually
 * failed is a POST, and the cases here pin that it is NOT replayed — replaying
 * it would post a user's message twice.
 */

/** A stub `fetch` that answers each call from a script and counts attempts. */
function scriptedFetch(script: ReadonlyArray<number | Error>) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const step = script[Math.min(calls.length, script.length - 1)];
    calls.push(String(init?.method ?? "GET"));
    if (step instanceof Error) throw step;
    return new Response(
      step === 204 ? null : JSON.stringify({ success: true, data: { ok: true } }),
      {
        status: step,
        headers: { "content-type": "application/json" }
      }
    );
  });
  return { fetchFn: fetchFn as unknown as typeof globalThis.fetch, calls };
}

function retryClient(script: ReadonlyArray<number | Error>, maxRetries?: number) {
  const { fetchFn, calls } = scriptedFetch(script);
  const http = new HttpClient({
    baseUrl: "https://api.nexusgpt.io",
    apiKey: "nxs_test",
    fetch: fetchFn,
    sleep: async () => undefined,
    ...(maxRetries === undefined ? {} : { maxRetries })
  });
  return { http, calls };
}

describe("retrying a transient failure", () => {
  it("replays a 502 on a GET and returns the attempt that succeeded", async () => {
    const { http, calls } = retryClient([502, 200]);

    await expect(http.request("GET", "/agents")).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["GET", "GET"]);
  });

  it("replays 503 and 504 too", async () => {
    for (const status of [503, 504]) {
      const { http, calls } = retryClient([status, 200]);
      await expect(http.request("GET", "/agents")).resolves.toEqual({ ok: true });
      expect({ status, attempts: calls.length }).toEqual({ status, attempts: 2 });
    }
  });

  it("gives up after maxRetries and surfaces the last status — three attempts, not more", async () => {
    const { http, calls } = retryClient([502]);

    await expect(http.request("GET", "/agents")).rejects.toMatchObject({ status: 502 });
    expect(calls.length).toBe(3);
  });

  it("honours maxRetries: 0 as OFF — one attempt, no replay", async () => {
    const { http, calls } = retryClient([502], 0);

    await expect(http.request("GET", "/agents")).rejects.toMatchObject({ status: 502 });
    expect(calls.length).toBe(1);
  });

  it.each([400, 401, 403, 404, 409, 422, 500])(
    "never replays %i — it is the server's answer, not a transient edge failure",
    async (status) => {
      const { http, calls } = retryClient([status, 200]);

      await expect(http.request("GET", "/agents")).rejects.toBeInstanceOf(Error);
      expect(calls.length).toBe(1);
    }
  );

  it.each(["POST", "PATCH"])(
    "NEVER replays a %s, even on 502 — a replay can double-apply it",
    async (method) => {
      const { http, calls } = retryClient([502, 200]);

      await expect(
        http.request(method, "/emulator/d/sessions/s/messages", { body: { t: "hi" } })
      ).rejects.toMatchObject({ status: 502 });
      expect(calls).toEqual([method]);
    }
  );

  it.each(["PUT", "DELETE"])("replays an idempotent %s", async (method) => {
    const { http, calls } = retryClient([502, 200]);

    await expect(http.request(method, "/agents/a")).resolves.toEqual({ ok: true });
    expect(calls.length).toBe(2);
  });

  it("replays a dropped connection but NEVER a timeout the caller asked for", async () => {
    const dropped = retryClient([new TypeError("fetch failed"), 200]);
    await expect(dropped.http.request("GET", "/agents")).resolves.toEqual({ ok: true });

    const abort = new DOMException("aborted", "AbortError");
    const timedOut = retryClient([abort, 200]);
    await expect(timedOut.http.request("GET", "/agents")).rejects.toBeInstanceOf(NexusTimeoutError);

    expect({ dropped: dropped.calls.length, timedOut: timedOut.calls.length }).toEqual({
      dropped: 2,
      timedOut: 1
    });
  });

  it("arms the timer with the ROUTE's deadline when the caller set no dial", async () => {
    // The route that asks the server to HOLD the connection. On the transport's
    // own default a 55 s server-side wait aborts locally and throws where the
    // caller was promised an outcome in the body, so the route's own deadline is
    // what has to arm the timer.
    //
    // PRECEDENCE, and it is deliberate: an explicit `HttpClientOptions.timeout`
    // outranks this — see the case below. The CLI only sets one when the user
    // passes `--timeout`, so the route's deadline is what applies by default and
    // an explicit dial still means what it says.
    let aborted = false;
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
          // Answers after the client's own 20 ms deadline, inside the 5 000 ms
          // this call asked for.
          setTimeout(
            () =>
              resolve(
                new Response(JSON.stringify({ success: true, data: { ok: true } }), {
                  status: 200,
                  headers: { "content-type": "application/json" }
                })
              ),
            60
          );
        })
    );
    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      fetch: fetchFn as unknown as typeof globalThis.fetch
    });

    await expect(http.request("GET", "/agents", { timeoutMs: 5_000 })).resolves.toEqual({
      ok: true
    });
    expect(aborted).toBe(false);
  });

  it("lets an EXPLICIT client dial outrank the route's own deadline", async () => {
    // The other half of the precedence. `--timeout` exists to bound a wait, so a
    // route asking for longer must not silently ignore it — the caller who typed
    // a number is the one who gets to be wrong about it.
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      timeout: 20,
      maxRetries: 0,
      fetch: fetchFn as unknown as typeof globalThis.fetch
    });

    await expect(http.request("GET", "/agents", { timeoutMs: 5_000 })).rejects.toMatchObject({
      message: expect.stringContaining("20")
    });
  });

  it("reports the EFFECTIVE deadline when a per-request timeout is the one that fires", async () => {
    // Reporting the client's 30 000 for a request given 40 sends the reader to
    // the wrong dial.
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      maxRetries: 0,
      fetch: fetchFn as unknown as typeof globalThis.fetch
    });

    await expect(http.request("GET", "/agents", { timeoutMs: 40 })).rejects.toMatchObject({
      message: expect.stringContaining("40")
    });
  });

  it("cancels the body of a discarded 502 so the socket is released", async () => {
    const cancel = vi.fn(async () => undefined);
    let n = 0;
    const fetchFn = vi.fn(async () => {
      n += 1;
      if (n === 1) {
        const res = new Response("<html>502 Bad Gateway</html>", { status: 502 });
        Object.defineProperty(res, "body", { value: { cancel }, configurable: true });
        return res;
      }
      return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
      sleep: async () => undefined
    });

    await expect(http.request("GET", "/agents")).resolves.toEqual({ ok: true });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("waits between attempts rather than hammering — the delays are the backoff", async () => {
    const slept: number[] = [];
    const { fetchFn } = scriptedFetch([502]);
    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      fetch: fetchFn,
      retryBaseDelayMs: 100,
      sleep: async (ms) => {
        slept.push(ms);
      }
    });

    await expect(http.request("GET", "/agents")).rejects.toMatchObject({ status: 502 });
    expect({ count: slept.length, allBounded: slept.every((ms) => ms >= 0 && ms <= 200) }).toEqual({
      count: 2,
      allBounded: true
    });
  });
});

describe("retryDelayMs", () => {
  it("doubles its ceiling per attempt and draws from zero", () => {
    expect([
      retryDelayMs(1, 250, () => 0.999999),
      retryDelayMs(2, 250, () => 0.999999),
      retryDelayMs(3, 250, () => 0.999999),
      retryDelayMs(1, 250, () => 0)
    ]).toEqual([249, 499, 999, 0]);
  });

  it("caps a runaway ceiling at 5s so a large maxRetries cannot stall a CLI", () => {
    expect(retryDelayMs(20, 250, () => 0.999999)).toBe(4999);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A 401 carries the server's OWN code, not a hardcoded "UNAUTHORIZED".
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `toApiError` COMPUTED the code and then threw it away on both 401 branches by
 * constructing `NexusAuthenticationError(message)`, whose constructor hardcoded
 * `super("UNAUTHORIZED", …)`. Every 401 therefore arrived at every consumer as
 * `UNAUTHORIZED`, whatever the server said.
 *
 * That is not cosmetic. The backend emits distinct 401 codes —
 * `AUTH_EXPIRED`, `AUTH_INVALID`, `REAUTH_REQUIRED`
 * (`documents/domain/errors/auth.errors.ts:17,38,59`) — and those are about a
 * CONNECTED PROVIDER (Google Drive, SharePoint, Notion), not about the caller's
 * Nexus API key. Flattened to `UNAUTHORIZED`, the CLI answers all of them with
 * `Run "nexus auth login"`, which sends the user to re-authenticate the one
 * thing that was never broken.
 *
 * The 401 branch is the ONLY place a computed code was discarded, and
 * `NexusAuthenticationError` is the only subclass that called `super` with a
 * code literal — verified across every class in `errors.ts`.
 */
describe("a 401 preserves the server's error code", () => {
  const envelope = (code: string) =>
    JSON.stringify({ success: false, error: { code, message: "Access token has expired" } });

  it("carries AUTH_EXPIRED through instead of flattening it to UNAUTHORIZED", async () => {
    const http = clientFor(401, envelope("AUTH_EXPIRED"));

    const err = await http.request("GET", "/documents").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NexusAuthenticationError);
    expect((err as NexusAuthenticationError).code).toBe("AUTH_EXPIRED");
    // Still a 401 and still the auth subclass — the fix widens the code, it does
    // not reclassify the error.
    expect((err as NexusAuthenticationError).status).toBe(401);
  });

  it.each(["AUTH_INVALID", "REAUTH_REQUIRED"])("carries %s through", async (code) => {
    const http = clientFor(401, envelope(code));

    const err = await http.request("GET", "/documents").catch((e: unknown) => e);

    expect((err as NexusAuthenticationError).code).toBe(code);
  });

  it("falls back to UNAUTHORIZED when the server sends no code", async () => {
    // Matching the shape the non-401 path already has with `HTTP_${status}`:
    // one default, stated in one place, rather than a second invented fallback.
    const http = clientFor(401, JSON.stringify({ success: false, error: { message: "nope" } }));

    const err = await http.request("GET", "/documents").catch((e: unknown) => e);

    expect((err as NexusAuthenticationError).code).toBe("UNAUTHORIZED");
  });

  it("falls back to UNAUTHORIZED on a body that is not an error envelope at all", async () => {
    const http = clientFor(401, JSON.stringify({ statusCode: 401, message: "Unauthorized" }));

    const err = await http.request("GET", "/documents").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NexusAuthenticationError);
    expect((err as NexusAuthenticationError).code).toBe("UNAUTHORIZED");
  });

  it("leaves the NON-401 fallback as HTTP_<status> — the two paths differ", async () => {
    // The defaults are deliberately not the same, which is why the computed code
    // is now `string | undefined` rather than pre-flattened. A 401 with no code
    // means UNAUTHORIZED; a 500 with no code has no better name than its status.
    const http = clientFor(500, JSON.stringify({ success: false, error: { message: "boom" } }));

    const err = await http.request("GET", "/documents").catch((e: unknown) => e);

    expect((err as NexusApiError).code).toBe("HTTP_500");
  });

  it("still defaults to UNAUTHORIZED when constructed with no code", async () => {
    // The SDK is published; this constructor is public API. Existing callers pass
    // only a message and must keep working.
    expect(new NexusAuthenticationError("nope").code).toBe("UNAUTHORIZED");
  });
});

/**
 * `requestSSE` — the transport half of the streaming turn (NEX-2768).
 *
 * Driven through a stub `fetch` whose body is a real `ReadableStream`, chunked
 * the way a network chunks one: records split across chunk boundaries, several
 * records in one chunk, comments interleaved. A stub that emitted one whole
 * record per chunk would exercise none of the buffering this method is.
 */
function streamingClient(
  chunks: string[],
  init: ResponseInit = { status: 200 }
): { http: HttpClient; cancelled: () => boolean } {
  let cancelled = false;

  const fetchFn = vi.fn(async () => {
    const encoder = new TextEncoder();
    let next = 0;
    // `pull`, not an eager `start`: a stream that enqueued everything and closed
    // in one tick is already finished by the time the caller reads it, so a
    // `cancel()` on it is a no-op and the abandonment case below would pass
    // against a fixture that could not fail.
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (next < chunks.length) controller.enqueue(encoder.encode(chunks[next++]));
        else controller.close();
      },
      cancel() {
        cancelled = true;
      }
    });
    return new Response(body, init);
  });

  return {
    http: new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      fetch: fetchFn as unknown as typeof globalThis.fetch
    }),
    cancelled: () => cancelled
  };
}

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("requestSSE", () => {
  it("yields one parsed frame per record, reassembling records split across chunks", async () => {
    const { http } = streamingClient([
      'data: {"type":"start"}\n\ndata: {"type":"tok',
      'en","delta":"hi"}\n\n',
      'data: {"type":"done"}\n\n'
    ]);

    await expect(collect(http.requestSSE("POST", "/stream"))).resolves.toEqual([
      { type: "start" },
      { type: "token", delta: "hi" },
      { type: "done" }
    ]);
  });

  it("ignores keepalive comments", async () => {
    // The server writes `: keepalive` every 15s through a silent turn. A client
    // that tried to parse one would throw on most of a long stream.
    const { http } = streamingClient([": keepalive\n\n", 'data: {"type":"done"}\n\n']);

    await expect(collect(http.requestSSE("POST", "/stream"))).resolves.toEqual([{ type: "done" }]);
  });

  it("skips a malformed frame rather than destroying the stream around it", async () => {
    const { http } = streamingClient([
      'data: {"type":"token","delta":"a"}\n\ndata: not json\n\ndata: {"type":"done"}\n\n'
    ]);

    await expect(collect(http.requestSSE("POST", "/stream"))).resolves.toEqual([
      { type: "token", delta: "a" },
      { type: "done" }
    ]);
  });

  it("yields a trailing record the server never terminated with a blank line", async () => {
    const { http } = streamingClient(['data: {"type":"done"}']);

    await expect(collect(http.requestSSE("POST", "/stream"))).resolves.toEqual([{ type: "done" }]);
  });

  it("cancels the underlying body when the caller leaves the loop early", async () => {
    // Abandoning a stream must not pin the connection. The turn keeps running
    // server-side; the socket does not.
    const { http, cancelled } = streamingClient([
      'data: {"type":"token","delta":"a"}\n\n',
      'data: {"type":"token","delta":"b"}\n\n',
      'data: {"type":"done"}\n\n'
    ]);

    for await (const _event of http.requestSSE("POST", "/stream")) break;

    expect(cancelled()).toBe(true);
  });

  it("throws the server's error for a refusal, which arrives before the stream opens", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "no" } }),
          {
            status: 404,
            headers: { "content-type": "application/json" }
          }
        )
    );
    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      fetch: fetchFn as unknown as typeof globalThis.fetch
    });

    const err = await collect(http.requestSSE("POST", "/stream")).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NexusApiError);
    expect((err as NexusApiError).code).toBe("NOT_FOUND");
  });

  it("arms the header wait with a real deadline instead of aborting on the next tick", async () => {
    // The deadline has to reach `send`. Without it the timer is armed as
    // `setTimeout(…, undefined)`, fires on the next tick, and aborts the request
    // before its headers arrive — every stream a timeout on a real network,
    // while the stub `fetch` of every test above resolves first and hides it.
    //
    // Fake timers and a fetch that answers only its own abort, the same shape
    // `long-running-operations.test.ts` uses: what is asserted is the deadline
    // that actually armed the timer, not one read back off the client.
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          })
      ) as unknown as typeof globalThis.fetch;
      const http = new HttpClient({
        baseUrl: "https://api.nexusgpt.io",
        apiKey: "nxs_test",
        fetch: fetchFn
      });

      const outcomes: unknown[] = [];
      // Never awaited: "still waiting" is one of the two answers this needs.
      collect(http.requestSSE("POST", "/stream")).then(
        () => outcomes.push(new Error("resolved, which this stub fetch never does")),
        (err: unknown) => outcomes.push(err)
      );

      const settle = async (ms: number) => {
        await vi.advanceTimersByTimeAsync(ms);
        // The rejection travels generator → `send` → `attempt`; each hop is a microtask.
        for (let i = 0; i < 10; i++) await Promise.resolve();
      };

      await settle(1_000);
      expect(outcomes).toEqual([]);

      await settle(DEFAULT_REQUEST_TIMEOUT_MS - 1_000);
      expect(outcomes[0]).toBeInstanceOf(NexusTimeoutError);
      // The default of an ordinary request, not a deadline of the stream's own:
      // the server flushes the SSE headers before the turn starts, and the timer
      // is cleared the moment they arrive.
      expect((outcomes[0] as NexusTimeoutError).timeoutMs).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for an event stream and sends the body", async () => {
    const seen: RequestInit[] = [];
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      seen.push(init);
      return new Response('data: {"type":"done"}\n\n', { status: 200 });
    });
    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      fetch: fetchFn as unknown as typeof globalThis.fetch
    });

    await collect(http.requestSSE("POST", "/stream", { body: { content: "hi" } }));

    const headers = seen[0].headers as Record<string, string>;
    expect(headers.Accept).toBe("text/event-stream");
    expect(headers["api-key"]).toBe("nxs_test");
    expect(seen[0].body).toBe(JSON.stringify({ content: "hi" }));
  });
});
