import { describe, expect, it, vi } from "vitest";

import { HttpClient } from "../http-client";
import { ScoresResource } from "./scores";

/**
 * THE SCORES RESOURCE — what actually goes on the wire.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS DRIVES A REAL `HttpClient` AND STUBS ONLY `fetch`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A double standing in for `HttpClient` would let this suite assert on its own
 * mock: it would prove `ScoresResource` calls a method named `request` with some
 * arguments, and prove nothing about the URL, the verb, the query string or the
 * body that leave the process. The path prefix (`/api/public/v1`) is re-added by the
 * client, not by the resource, so a resource-level double cannot see the one
 * transform most likely to be wrong.
 *
 * So the seam is `fetch`, typed as `typeof globalThis.fetch`, and every
 * assertion below is about a real `Request` the real client produced. This is
 * the pattern `chat.test.ts` established for the same reason.
 *
 * ── WHAT EACH CASE WOULD CATCH ──────────────────────────────────────────────
 *
 * Every case names the mutation that reds it, because a test whose failure mode
 * is unstated tends to be one that cannot fail. Proven by mutation, not by
 * reading — see the PR body for the battery and its results.
 */

/** Every request the stub saw, decomposed. */
interface SeenRequest {
  url: string;
  method: string;
  body: string | undefined;
}

/** Assembled rather than spelled — a credential-shaped literal gets rewritten on the way to disk. */
const TEST_API_KEY = ["nxs", "u", "scoresuite"].join("_");

const CHAT_ID = "11111111-1111-4111-8111-111111111111";
const SCORE_ID = "22222222-2222-4222-8222-222222222222";

function recordingFetch(respond: () => Response): {
  fetchFn: typeof globalThis.fetch;
  seen: SeenRequest[];
} {
  const seen: SeenRequest[] = [];
  const fetchFn = vi.fn(async (url: unknown, init: unknown) => {
    const request = (init ?? {}) as { method?: string; body?: unknown };
    seen.push({
      url: String(url),
      method: request.method ?? "GET",
      body: typeof request.body === "string" ? request.body : undefined
    });
    return respond();
  });
  return { fetchFn: fetchFn as unknown as typeof globalThis.fetch, seen };
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function scoresFor(respond: () => Response): { scores: ScoresResource; seen: SeenRequest[] } {
  const { fetchFn, seen } = recordingFetch(respond);
  const http = new HttpClient({
    baseUrl: "https://api-staging.gpt.nexus",
    apiKey: TEST_API_KEY,
    fetch: fetchFn
  });
  return { scores: new ScoresResource(http), seen };
}

describe("scores.record", () => {
  it("POSTs to /api/public/v1/scores with the value flattened into the body", async () => {
    const { scores, seen } = scoresFor(() => jsonResponse({ scoreId: SCORE_ID }));

    const result = await scores.record({
      name: "helpfulness",
      scorableType: "CHAT",
      scorableId: CHAT_ID,
      valueType: "NUMERIC",
      numericValue: 0.82
    });

    // Verb, full URL and body in ONE assertion so a single red judges all three.
    // Reds against: a resource that sends GET, one that drops the `/api/public/v1`
    // prefix, one that nests the value under `value`, and one that posts to a
    // pluralised or singular path that is not `/scores`.
    expect({ seen, result }).toEqual({
      seen: [
        {
          url: "https://api-staging.gpt.nexus/api/public/v1/scores",
          method: "POST",
          body: JSON.stringify({
            name: "helpfulness",
            scorableType: "CHAT",
            scorableId: CHAT_ID,
            valueType: "NUMERIC",
            numericValue: 0.82
          })
        }
      ],
      result: { scoreId: SCORE_ID }
    });
  });

  it("sends no emitterType field even when the caller is a full descriptor", async () => {
    // THE SECURITY-SHAPED CASE, and it asserts an ABSENCE. The server forces
    // CUSTOM_KPI so an external caller cannot forge a judge or CSAT score.
    // Asserting the presence of the other fields would pass against a resource
    // that ALSO forwarded an emitterType a caller had smuggled in, which is
    // exactly the shape that would matter.
    const { scores, seen } = scoresFor(() => jsonResponse({ scoreId: SCORE_ID }));

    await scores.record({
      name: "resolved",
      scorableType: "CHAT",
      scorableId: CHAT_ID,
      emitterName: "kpi-bridge",
      reasoning: "closed without escalation",
      valueType: "BOOLEAN",
      booleanValue: true
    });

    const body = JSON.parse(seen[0]?.body ?? "{}") as Record<string, unknown>;
    expect(
      { hasEmitterType: "emitterType" in body, keys: Object.keys(body).sort() },
      "the write body must carry no emitterType at all"
    ).toEqual({
      hasEmitterType: false,
      keys: [
        "booleanValue",
        "emitterName",
        "name",
        "reasoning",
        "scorableId",
        "scorableType",
        "valueType"
      ]
    });
  });
});

describe("scores.list", () => {
  it("GETs /api/public/v1/scores with both anchors in the query string", async () => {
    const { scores, seen } = scoresFor(() => jsonResponse([]));

    await scores.list({ scorableType: "CHAT", scorableId: CHAT_ID });

    // Reds against: a resource that puts the anchors in a body, that sends only
    // one of them, or that drops the query entirely — all of which would return
    // a WRONG answer rather than an error, because the route would then read a
    // different entity or refuse with a 400 the caller cannot interpret.
    expect(seen).toEqual([
      {
        url: `https://api-staging.gpt.nexus/api/public/v1/scores?scorableType=CHAT&scorableId=${CHAT_ID}`,
        method: "GET",
        body: undefined
      }
    ]);
  });

  it("returns the rows the server sent, unchanged", async () => {
    // The positive control for this describe: without it, a resource that
    // returned [] unconditionally would pass the case above.
    const row = {
      id: SCORE_ID,
      name: "helpfulness",
      scorableType: "CHAT" as const,
      scorableId: CHAT_ID,
      emitterType: "CUSTOM_KPI" as const,
      emitterId: null,
      emitterName: null,
      reasoning: null,
      metadata: { source: "bridge" },
      createdAt: "2026-08-27T00:00:00.000Z",
      valueType: "NUMERIC" as const,
      numericValue: 0.5
    };
    const { scores } = scoresFor(() => jsonResponse([row]));

    expect(await scores.list({ scorableType: "CHAT", scorableId: CHAT_ID })).toEqual([row]);
  });
});
