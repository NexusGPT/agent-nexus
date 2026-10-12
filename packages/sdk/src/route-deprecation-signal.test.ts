import { describe, expect, it, vi } from "vitest";

import {
  type DeprecationNotice,
  parseDeprecationHeader,
  parseSunsetHeader,
  readDeprecationNotice
} from "./deprecation";
import { HttpClient } from "./http-client";

/**
 * THE ROUTE-RETIREMENT SIGNAL, DRIVEN THROUGH THE REAL TRANSPORT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔑 EVERY HEADER NAME AND VALUE BELOW IS A LITERAL, AND THAT IS THE POINT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Nothing here imports `DEPRECATION_HEADER` or `SUNSET_HEADER` to BUILD a
 * fixture. A spec that built its response from the same constant the client
 * looks up would pass for any value of that constant — rename it to
 * `Deprecated` and the spec renames its own fixture in the same breath, so the
 * client would stop reading the header the server actually sends and nothing
 * would go red. The wire names are the contract; they are typed out.
 *
 * Same discipline for the two VALUE syntaxes. `@1788048000` is an RFC 8941
 * structured-field Date (Unix seconds) and `Sat, 28 Nov 2026 00:00:00 GMT` is an
 * RFC 7231 IMF-fixdate. Both are written here as the server writes them, so a
 * parser that treated either as the other would be caught rather than agreed
 * with.
 *
 * ── WHY THROUGH `HttpClient` AND NOT ONLY AGAINST THE PURE READER ───────────
 *
 * `readDeprecationNotice` parsing bytes correctly proves nothing about a signal
 * REACHING a caller. The observation happens in `send`, which is the one place
 * every door obtains a response, and the claim worth defending is that each door
 * is covered — so each door gets its own arm, against an injected `fetch`
 * carrying real headers.
 *
 * ── ONE PROPERTY PER `it` ───────────────────────────────────────────────────
 *
 * A failing assertion throws and aborts the rest of its own block, so two
 * properties in one `it` means a mutant that moves both scores only the first
 * and the second never runs. The arms are split accordingly, and the dedupe /
 * negative arms each sit beside a positive arm over the same harness.
 */

/** The two values the server actually sends, verbatim. */
const DEPRECATION_VALUE = "@1788048000";
const SUNSET_VALUE = "Sat, 28 Nov 2026 00:00:00 GMT";

/** `@1788048000` seconds, as milliseconds. */
const DEPRECATION_MS = 1_788_048_000_000;

const ENVELOPE = JSON.stringify({ success: true, data: { id: "a" } });

/** A stub `fetch` answering each call from `responses`, in order. */
function stubFetch(responses: readonly (() => Response)[]): typeof globalThis.fetch {
  let n = 0;
  const fetchFn = vi.fn(async () => {
    const make = responses[Math.min(n, responses.length - 1)];
    n += 1;
    if (make === undefined) throw new Error("stub exhausted");
    return make();
  });
  return fetchFn as unknown as typeof globalThis.fetch;
}

function jsonWith(headers: Record<string, string>, status = 200, body = ENVELOPE): () => Response {
  return () =>
    new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
}

/** A client plus the notices its observer received. */
function clientWith(
  responses: readonly (() => Response)[],
  observer?: (notice: DeprecationNotice) => void
): { http: HttpClient; seen: DeprecationNotice[] } {
  const seen: DeprecationNotice[] = [];
  const http = new HttpClient({
    baseUrl: "https://api.nexusgpt.io",
    apiKey: "nxs_test",
    fetch: stubFetch(responses),
    // Pinned so a retry arm does not actually wait out a backoff.
    sleep: async () => undefined,
    random: () => 0,
    onDeprecation:
      observer ??
      ((notice) => {
        seen.push(notice);
      })
  });
  return { http, seen };
}

const BOTH_HEADERS = { Deprecation: DEPRECATION_VALUE, Sunset: SUNSET_VALUE };

describe("the route-retirement signal reaches the caller", () => {
  it("fires exactly once for one response carrying both headers", async () => {
    const { http, seen } = clientWith([jsonWith(BOTH_HEADERS)]);

    await http.requestWithMeta("GET", "/agents/abc/versions");

    expect(seen).toHaveLength(1);
  });

  it("carries the `Deprecation` value verbatim", async () => {
    const { http, seen } = clientWith([jsonWith(BOTH_HEADERS)]);

    await http.requestWithMeta("GET", "/agents/abc/versions");

    expect(seen[0]?.deprecation).toBe(DEPRECATION_VALUE);
  });

  it("carries the `Sunset` value verbatim", async () => {
    const { http, seen } = clientWith([jsonWith(BOTH_HEADERS)]);

    await http.requestWithMeta("GET", "/agents/abc/versions");

    expect(seen[0]?.sunset).toBe(SUNSET_VALUE);
  });

  it("parses `Deprecation` as Unix SECONDS, not as a date string", async () => {
    const { http, seen } = clientWith([jsonWith(BOTH_HEADERS)]);

    await http.requestWithMeta("GET", "/agents/abc/versions");

    // `new Date("@1788048000")` is Invalid Date, so this number is only
    // reachable by reading the value as an sf-date.
    expect(seen[0]?.deprecatedAt?.getTime()).toBe(DEPRECATION_MS);
  });

  it("parses `Sunset` as an IMF-fixdate", async () => {
    const { http, seen } = clientWith([jsonWith(BOTH_HEADERS)]);

    await http.requestWithMeta("GET", "/agents/abc/versions");

    expect(seen[0]?.sunsetAt?.toISOString()).toBe("2026-11-28T00:00:00.000Z");
  });

  it("names the method and the absolute URL of the request that earned it", async () => {
    const { http, seen } = clientWith([jsonWith(BOTH_HEADERS)]);

    await http.requestWithMeta("get", "/agents/abc/versions", { query: { limit: 2 } });

    expect(seen[0]).toMatchObject({
      method: "GET",
      url: "https://api.nexusgpt.io/api/public/v1/agents/abc/versions?limit=2"
    });
  });

  it("reads the headers case-insensitively, as the wire permits", async () => {
    const { http, seen } = clientWith([
      jsonWith({ deprecation: DEPRECATION_VALUE, sunset: SUNSET_VALUE })
    ]);

    await http.requestWithMeta("GET", "/agents/abc/versions");

    expect(seen).toHaveLength(1);
  });
});

describe("a response that says nothing", () => {
  // The POSITIVE twin of the arm below, over the same harness. Without it, an
  // empty `seen` is satisfied by a client that fires on nothing at all —
  // including one whose request never happened.
  it("CONTROL — the same harness DOES fire when the headers are present", async () => {
    const { http, seen } = clientWith([jsonWith(BOTH_HEADERS)]);

    await http.requestWithMeta("GET", "/agents");

    expect(seen).toHaveLength(1);
  });

  it("fires nothing when neither header is present", async () => {
    const { http, seen } = clientWith([jsonWith({})]);

    await http.requestWithMeta("GET", "/agents");

    expect(seen).toEqual([]);
  });

  it("still returns the payload when neither header is present", async () => {
    const { http, seen } = clientWith([jsonWith({})]);

    // Proves the empty `seen` above came from a request that SUCCEEDED, rather
    // than from one that threw before any response existed.
    await expect(http.requestWithMeta("GET", "/agents")).resolves.toEqual({
      data: { id: "a" },
      meta: undefined
    });
    expect(seen).toEqual([]);
  });
});

describe("a half-announced retirement", () => {
  it("fires on `Deprecation` alone", async () => {
    const { http, seen } = clientWith([jsonWith({ Deprecation: DEPRECATION_VALUE })]);

    await http.requestWithMeta("GET", "/agents");

    expect(seen).toHaveLength(1);
  });

  it("reports no sunset when only `Deprecation` was sent", async () => {
    const { http, seen } = clientWith([jsonWith({ Deprecation: DEPRECATION_VALUE })]);

    await http.requestWithMeta("GET", "/agents");

    expect(seen[0]?.sunset).toBeUndefined();
  });

  it("fires on `Sunset` alone, which RFC 8594 permits", async () => {
    const { http, seen } = clientWith([jsonWith({ Sunset: SUNSET_VALUE })]);

    await http.requestWithMeta("GET", "/agents");

    expect(seen).toHaveLength(1);
  });
});

describe("a value this client cannot parse is surfaced, never swallowed", () => {
  it("still fires on the obsolete `Deprecation: true` spelling", async () => {
    const { http, seen } = clientWith([jsonWith({ Deprecation: "true" })]);

    await http.requestWithMeta("GET", "/agents");

    expect(seen[0]?.deprecation).toBe("true");
  });

  it("reports no DATE for `Deprecation: true`, because it states none", async () => {
    const { http, seen } = clientWith([jsonWith({ Deprecation: "true" })]);

    await http.requestWithMeta("GET", "/agents");

    expect(seen[0]?.deprecatedAt).toBeUndefined();
  });

  it("keeps an unparseable `Sunset` as its raw string", async () => {
    const { http, seen } = clientWith([jsonWith({ Sunset: "next tuesday-ish" })]);

    await http.requestWithMeta("GET", "/agents");

    expect(seen[0]).toMatchObject({ sunset: "next tuesday-ish", sunsetAt: undefined });
  });

  it("treats an empty header value as no signal at all", async () => {
    const { http, seen } = clientWith([jsonWith({ Deprecation: "", Sunset: "   " })]);

    await http.requestWithMeta("GET", "/agents");

    expect(seen).toEqual([]);
  });
});

describe("every door of the transport is covered by the one read in `send`", () => {
  it("covers `request`", async () => {
    const { http, seen } = clientWith([jsonWith(BOTH_HEADERS)]);

    await http.request("GET", "/agents");

    expect(seen).toHaveLength(1);
  });

  it("covers `requestRaw`", async () => {
    const { http, seen } = clientWith([
      () => new Response("id,name\n1,a\n", { status: 200, headers: BOTH_HEADERS })
    ]);

    await http.requestRaw("GET", "/agents/export");

    expect(seen).toHaveLength(1);
  });

  it("covers `openStream`", async () => {
    const { http, seen } = clientWith([
      () =>
        new Response("data: {}\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream", ...BOTH_HEADERS }
        })
    ]);

    const res = await http.openStream("POST", "/chat/stream");
    await res.body?.cancel();

    expect(seen).toHaveLength(1);
  });

  it("covers an ERROR response, which is a response the route still signed", async () => {
    const { http, seen } = clientWith([
      jsonWith(BOTH_HEADERS, 404, JSON.stringify({ success: false, error: { code: "NOT_FOUND" } }))
    ]);

    await expect(http.requestWithMeta("GET", "/agents/missing/versions")).rejects.toThrow();

    expect(seen).toHaveLength(1);
  });
});

describe("the observation sits inside the retry loop, not after it", () => {
  it("reports every attempt that produced a response", async () => {
    // 429 then 200, both signed. Observed at the return point instead, the
    // first response's signal would be lost — and the 429 is exactly the
    // attempt a rate-limited script sees most of.
    const { http, seen } = clientWith([jsonWith(BOTH_HEADERS, 429), jsonWith(BOTH_HEADERS)]);

    await http.requestWithMeta("GET", "/agents/abc/versions");

    expect(seen).toHaveLength(2);
  });
});

describe("the observer cannot break the request", () => {
  it("swallows a throw from the observer and still resolves", async () => {
    const { http } = clientWith([jsonWith(BOTH_HEADERS)], () => {
      throw new Error("consumer blew up");
    });

    await expect(http.requestWithMeta("GET", "/agents")).resolves.toEqual({
      data: { id: "a" },
      meta: undefined
    });
  });

  it("does nothing at all when no observer is installed", async () => {
    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      fetch: stubFetch([jsonWith(BOTH_HEADERS)])
    });

    await expect(http.requestWithMeta("GET", "/agents")).resolves.toEqual({
      data: { id: "a" },
      meta: undefined
    });
  });
});

describe("the pure reader", () => {
  it("returns undefined when a response carries neither header", () => {
    const headers = new Headers({ "content-type": "application/json" });

    expect(readDeprecationNotice("GET", "https://x/y", headers)).toBeUndefined();
  });

  it("refuses a fractional sf-date rather than truncating it", () => {
    expect(parseDeprecationHeader("@1788048000.5")).toBeUndefined();
  });

  it("refuses an sf-date past the safe-integer range rather than yielding NaN", () => {
    expect(parseDeprecationHeader("@999999999999999999999")).toBeUndefined();
  });

  it("refuses an IMF-fixdate handed to the `Deprecation` parser", () => {
    // The two syntaxes are not interchangeable, and this is the arm that says so
    // from the other direction.
    expect(parseDeprecationHeader(SUNSET_VALUE)).toBeUndefined();
  });

  it("refuses an sf-date handed to the `Sunset` parser", () => {
    expect(parseSunsetHeader(DEPRECATION_VALUE)).toBeUndefined();
  });

  it("accepts the epoch, which is a falsy number of seconds", () => {
    // `@0` parses to a real instant, so a truthiness test on the seconds would
    // drop it. Unlikely on the wire and free to get right.
    expect(parseDeprecationHeader("@0")?.getTime()).toBe(0);
  });
});
