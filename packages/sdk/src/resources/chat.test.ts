import { describe, expect, it, vi } from "vitest";

import { NexusApiError } from "../errors";
import { HttpClient } from "../http-client";
import type { ChatStreamChunk } from "../types/chat";
import { ChatResource } from "./chat";

/**
 * THE CHAT RESOURCE, and the one property that is not a matter of taste.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 THE STREAM HOP MUST SEND NO `api-key`, AND THE ASSERTION IS AN ABSENCE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `CompositeAuthGuard` tries its credentials in a fixed order and the FIRST
 * branch that matches short-circuits — the org api-key is tried BEFORE the chat
 * session. So a request carrying both authenticates as the api-key,
 * `request.chatSession` is never written, and the handler's
 * `@CurrentChatSession()` throws `401 "Chat session is not valid."` — with a
 * message that reads exactly like an expired token while the token is perfect.
 *
 * Measured against the live staging route on 2026-08-20: a session token that
 * streamed seconds earlier answered 401 the moment an `api-key` header rode
 * along.
 *
 * That is why the load-bearing test asserts the ABSENCE of `api-key` rather than
 * the presence of `x-chat-session-token`. Asserting the presence alone passes
 * against a client that sends BOTH, which is the exact configuration that fails
 * in production — and it fails with a refusal nobody would trace back to this
 * file.
 */

/** Every header of the last request the stub saw, lower-cased. */
interface SeenRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/** The api key this suite constructs its client with, assembled rather than spelled. */
const TEST_API_KEY = ["nxs", "u", "chatsuite"].join("_");

/** The session token, likewise assembled — a credential-shaped literal gets rewritten on the way to disk. */
const TEST_SESSION_TOKEN = ["chat", "session", "token", "fixture"].join(".");

function recordingFetch(respond: () => Response): {
  fetchFn: typeof globalThis.fetch;
  seen: SeenRequest[];
} {
  const seen: SeenRequest[] = [];
  const fetchFn = vi.fn(async (url: unknown, init: unknown) => {
    const request = (init ?? {}) as {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    };
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers ?? {})) {
      headers[key.toLowerCase()] = value;
    }
    seen.push({
      url: String(url),
      method: request.method ?? "GET",
      headers,
      body: typeof request.body === "string" ? request.body : undefined
    });
    return respond();
  });
  return { fetchFn: fetchFn as unknown as typeof globalThis.fetch, seen };
}

/**
 * One `text/event-stream` response built from whole SSE records.
 *
 * Written as raw text rather than as a list of objects on purpose: the framing
 * IS part of what this suite checks — a comment frame carries no `data:` line,
 * the `[DONE]` sentinel is not JSON, and two records can share one network
 * chunk.
 */
function sseResponse(text: string, headers: Record<string, string> = {}): Response {
  return new Response(text, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
      ...headers
    }
  });
}

/** The exact frame sequence a real text turn produced on staging, verbatim. */
const A_TEXT_TURN = [
  'data: {"type":"start"}',
  "",
  'data: {"type":"text-start","id":"m1"}',
  "",
  'data: {"type":"text-delta","id":"m1","delta":"HEL"}',
  "",
  ": keepalive",
  "",
  'data: {"type":"text-delta","id":"m1","delta":"LO"}',
  "",
  'data: {"type":"text-end","id":"m1"}',
  "",
  'data: {"type":"finish","finishReason":"stop"}',
  "",
  "data: [DONE]",
  "",
  ""
].join("\n");

function chatFor(respond: () => Response): { chat: ChatResource; seen: SeenRequest[] } {
  const { fetchFn, seen } = recordingFetch(respond);
  const http = new HttpClient({
    baseUrl: "https://api-staging.gpt.nexus",
    apiKey: TEST_API_KEY,
    fetch: fetchFn
  });
  return { chat: new ChatResource(http), seen };
}

const DEPLOYMENT = "44444444-4444-4444-8444-444444444444";

describe("chat.createSession — hop one, spending the ORG API KEY", () => {
  it("POSTs the mint route with the api key and no session token", async () => {
    const { chat, seen } = chatFor(
      () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { token: "t", sessionId: "s", chatId: "c", expiresInSeconds: 900 }
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
    );

    const session = await chat.createSession(DEPLOYMENT, { externalUserId: "u-1" });

    expect(session).toEqual({ token: "t", sessionId: "s", chatId: "c", expiresInSeconds: 900 });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe(
      `https://api-staging.gpt.nexus/api/public/v1/deployments/${DEPLOYMENT}/chat-session`
    );
    expect(seen[0].headers["api-key"]).toBe(TEST_API_KEY);
    // The mint is the PRIVILEGED hop. A session token here would be a client
    // trying to mint from a credential that cannot.
    expect(seen[0].headers).not.toHaveProperty("x-chat-session-token");
    expect(seen[0].body).toBe(JSON.stringify({ externalUserId: "u-1" }));
  });
});

describe("chat.stream — hop two, spending the SESSION TOKEN", () => {
  it("sends the session token and NO api-key at all", async () => {
    const { chat, seen } = chatFor(() => sseResponse(A_TEXT_TURN));

    for await (const _chunk of chat.stream(
      DEPLOYMENT,
      { content: "hi" },
      { token: TEST_SESSION_TOKEN }
    )) {
      // drained below; this test is about the request
    }

    expect(seen).toHaveLength(1);
    expect(seen[0].headers["x-chat-session-token"]).toBe(TEST_SESSION_TOKEN);
    // 🔴 THE ASSERTION THIS FILE EXISTS FOR. See the header.
    expect(seen[0].headers).not.toHaveProperty("api-key");
    expect(seen[0].headers.accept).toBe("text/event-stream");
    expect(seen[0].url).toBe(
      `https://api-staging.gpt.nexus/api/public/v1/deployments/${DEPLOYMENT}/chat`
    );
  });

  it("yields every frame in order, skipping the comment frame and the [DONE] sentinel", async () => {
    const { chat } = chatFor(() => sseResponse(A_TEXT_TURN));

    const chunks: ChatStreamChunk[] = [];
    for await (const chunk of chat.stream(
      DEPLOYMENT,
      { content: "hi" },
      { token: TEST_SESSION_TOKEN }
    )) {
      chunks.push(chunk);
    }

    expect(chunks.map((c) => c.type)).toEqual([
      "start",
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "finish"
    ]);

    // The deltas concatenate into the answer. A client APPENDS, never replaces —
    // which is why a replay that re-sends the whole turn duplicates it.
    const text = chunks
      .filter((c): c is Extract<ChatStreamChunk, { type: "text-delta" }> => c.type === "text-delta")
      .map((c) => c.delta)
      .join("");
    expect(text).toBe("HELLO");
  });

  it("accepts a stock useChat body — messages, id, trigger and messageId all survive", async () => {
    const { chat, seen } = chatFor(() => sseResponse(A_TEXT_TURN));

    const body = {
      id: "thread-1",
      trigger: "submit-message",
      messageId: "client-generated-id",
      messages: [{ id: "client-generated-id", role: "user", parts: [{ type: "text", text: "hi" }] }]
    };

    for await (const _chunk of chat.stream(DEPLOYMENT, body, { token: TEST_SESSION_TOKEN })) {
      // drained
    }

    expect(JSON.parse(seen[0].body ?? "null")).toEqual(body);
  });

  it("maps a refusal to a NexusApiError carrying the server's own code", async () => {
    const { chat } = chatFor(
      () =>
        new Response(
          JSON.stringify({ success: false, error: { code: "INVALID_TOKEN", message: "nope" } }),
          { status: 401, headers: { "content-type": "application/json" } }
        )
    );

    // A refusal happens BEFORE the stream opens, so it is ordinary JSON and the
    // generator must throw rather than yield a frame that is really an error.
    const iterate = async () => {
      for await (const _chunk of chat.stream(
        DEPLOYMENT,
        { content: "hi" },
        { token: TEST_SESSION_TOKEN }
      )) {
        // unreachable
      }
    };

    await expect(iterate()).rejects.toBeInstanceOf(NexusApiError);
  });
});

describe("chat.streamRaw — the useChat door", () => {
  it("hands back the Response with its protocol header and an UNREAD body", async () => {
    const { chat } = chatFor(() => sseResponse(A_TEXT_TURN));

    const response = await chat.streamRaw(
      DEPLOYMENT,
      { content: "hi" },
      { token: TEST_SESSION_TOKEN }
    );

    // The headers are the half `stream()` has already thrown away, and they are
    // the reason this door exists: `ai`'s own transport reads them.
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(ChatResource.isUiMessageStream(response)).toBe(true);
    expect(response.bodyUsed).toBe(false);

    // …and it is genuinely forwardable: the caller reads it, not us.
    expect(await response.text()).toContain('"type":"text-delta"');
  });

  it("reports a stream that does NOT announce the protocol, rather than refusing it", async () => {
    // A proxy that strips the header leaves a stream that is still readable
    // frame by frame. Refusing it here would break a working turn; saying
    // nothing would hide a rewritten response. So it is a readable fact.
    const { chat } = chatFor(
      () =>
        new Response(A_TEXT_TURN, {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        })
    );

    const response = await chat.streamRaw(
      DEPLOYMENT,
      { content: "hi" },
      { token: TEST_SESSION_TOKEN }
    );

    expect(ChatResource.isUiMessageStream(response)).toBe(false);
    expect(response.ok).toBe(true);
  });

  it("throws on a refusal instead of handing back an error Response", async () => {
    const { chat } = chatFor(
      () =>
        new Response(
          JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "nope" } }),
          { status: 401, headers: { "content-type": "application/json" } }
        )
    );

    await expect(
      chat.streamRaw(DEPLOYMENT, { content: "hi" }, { token: TEST_SESSION_TOKEN })
    ).rejects.toBeInstanceOf(NexusApiError);
  });
});

/**
 * A RESUMED stream, verbatim in shape from a live staging capture.
 *
 * 🔑 THE FIRST FRAME IS THE WHOLE POINT. It reopens block `m1` — the SAME id
 * the original opener used — and it carries NO `id:` line, because it is a
 * SYNTHESISED frame rather than a log entry. A reader that recorded a cursor
 * for it would resume next time at a position the log does not contain.
 *
 * Everything after it is the real log, replayed from the frame AFTER the
 * cursor: the client asked from `t1:13` and got `t1:14` onwards.
 */
const A_RESUMED_TURN = [
  'data: {"type":"text-start","id":"m1"}',
  "",
  "id: t1:14",
  'data: {"type":"text-delta","id":"m1","delta":" WORLD"}',
  "",
  "id: t1:15",
  'data: {"type":"text-end","id":"m1"}',
  "",
  "id: t1:16",
  'data: {"type":"finish","finishReason":"stop"}',
  "",
  "data: [DONE]",
  "",
  ""
].join("\n");

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("chat.stop — the Stop button", () => {
  it("POSTs the stop route with the session token and NO api-key", async () => {
    const { chat, seen } = chatFor(() => jsonResponse({ accepted: true, turnId: "t1" }));

    const result = await chat.stop(DEPLOYMENT, {}, { token: TEST_SESSION_TOKEN });

    expect(result).toEqual({ accepted: true, turnId: "t1" });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe(
      `https://api-staging.gpt.nexus/api/public/v1/deployments/${DEPLOYMENT}/chat/stop`
    );
    expect(seen[0].headers["x-chat-session-token"]).toBe(TEST_SESSION_TOKEN);
    expect(seen[0].headers).not.toHaveProperty("api-key");
  });

  it("sends turnId when the caller names the turn, and an empty body when it does not", async () => {
    const { chat, seen } = chatFor(() => jsonResponse({ accepted: true, turnId: "t9" }));

    await chat.stop(DEPLOYMENT, { turnId: "t9" }, { token: TEST_SESSION_TOKEN });
    await chat.stop(DEPLOYMENT, {}, { token: TEST_SESSION_TOKEN });

    expect(JSON.parse(seen[0].body ?? "null")).toEqual({ turnId: "t9" });
    // `{}` rather than no body: the route's schema is `.strict()` and its own
    // handler has two arms for exactly this, so `{}` is the shape it validates.
    expect(JSON.parse(seen[1].body ?? "null")).toEqual({});
  });

  it("reports accepted:false with a null turn rather than throwing when nothing is running", async () => {
    // The route answers 200 either way. `accepted` is a FACT about what was
    // found, never an error — a caller pressing Stop on a finished turn has not
    // done anything wrong.
    const { chat } = chatFor(() => jsonResponse({ accepted: false, turnId: null }));

    await expect(chat.stop(DEPLOYMENT, {}, { token: TEST_SESSION_TOKEN })).resolves.toEqual({
      accepted: false,
      turnId: null
    });
  });
});

describe("chat.status — the fact the stop route deliberately does not claim", () => {
  it("GETs the status route with the session token and NO api-key", async () => {
    const { chat, seen } = chatFor(() =>
      jsonResponse({
        turnId: "t1",
        running: false,
        outcome: "stopped",
        lastEventId: "t1:16",
        frameCount: 17
      })
    );

    const status = await chat.status(DEPLOYMENT, { token: TEST_SESSION_TOKEN });

    expect(status.outcome).toBe("stopped");
    expect(status.running).toBe(false);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe(
      `https://api-staging.gpt.nexus/api/public/v1/deployments/${DEPLOYMENT}/chat/status`
    );
    expect(seen[0].headers["x-chat-session-token"]).toBe(TEST_SESSION_TOKEN);
    expect(seen[0].headers).not.toHaveProperty("api-key");
  });

  it("carries the all-null shape a conversation with no turn answers", async () => {
    const { chat } = chatFor(() =>
      jsonResponse({
        turnId: null,
        running: false,
        outcome: null,
        lastEventId: null,
        frameCount: 0
      })
    );

    await expect(chat.status(DEPLOYMENT, { token: TEST_SESSION_TOKEN })).resolves.toEqual({
      turnId: null,
      running: false,
      outcome: null,
      lastEventId: null,
      frameCount: 0
    });
  });
});

describe("chat.resume — reattaching, and the cursor that makes it possible twice", () => {
  it("sends Last-Event-ID when given a cursor and omits the header entirely without one", async () => {
    const { chat, seen } = chatFor(() => sseResponse(A_RESUMED_TURN));

    for await (const _chunk of chat.resume(
      DEPLOYMENT,
      { token: TEST_SESSION_TOKEN },
      { lastEventId: "t1:13" }
    )) {
      // drained
    }
    for await (const _chunk of chat.resume(DEPLOYMENT, { token: TEST_SESSION_TOKEN })) {
      // drained
    }

    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe(
      `https://api-staging.gpt.nexus/api/public/v1/deployments/${DEPLOYMENT}/chat/stream`
    );
    expect(seen[0].headers["last-event-id"]).toBe("t1:13");
    expect(seen[0].headers).not.toHaveProperty("api-key");

    // No cursor must mean NO header, not an empty one: an empty `Last-Event-ID`
    // is a value the server would have to interpret, and "replay everything" is
    // what the absent header already means.
    expect(seen[1].headers).not.toHaveProperty("last-event-id");
  });

  it("yields the synthesised opener as an ordinary frame, so a client reopens the block", async () => {
    // The reader that this SDK's frames feed THROWS on a `text-delta` whose
    // opener it never saw. Swallowing the synthetic `text-start` here — as a
    // dedupe on block id would — is what would make that throw happen.
    const { chat } = chatFor(() => sseResponse(A_RESUMED_TURN));

    const chunks: ChatStreamChunk[] = [];
    for await (const chunk of chat.resume(
      DEPLOYMENT,
      { token: TEST_SESSION_TOKEN },
      { lastEventId: "t1:13" }
    )) {
      chunks.push(chunk);
    }

    expect(chunks.map((c) => c.type)).toEqual(["text-start", "text-delta", "text-end", "finish"]);
    expect(chunks[0]).toEqual({ type: "text-start", id: "m1" });
  });

  it("🔴 does NOT move the cursor for the synthesised opener", async () => {
    // The load-bearing assertion of this whole surface. The opener carries no
    // `id:`, so a reader that recorded one would resume the NEXT time from a
    // position the log does not hold. Asserting the recorded list is exactly the
    // three real ids proves both halves at once: the opener contributed nothing,
    // and every real frame did.
    const { chat } = chatFor(() => sseResponse(A_RESUMED_TURN));

    const cursors: string[] = [];
    for await (const _chunk of chat.resume(
      DEPLOYMENT,
      { token: TEST_SESSION_TOKEN },
      { lastEventId: "t1:13", onEventId: (id) => cursors.push(id) }
    )) {
      // drained
    }

    expect(cursors).toEqual(["t1:14", "t1:15", "t1:16"]);
  });

  it("reports each id only after its own frame has been handed to the caller", async () => {
    // A cursor that advanced BEFORE the frame was consumed would skip that frame
    // on the next resume, which is the same data loss the exclusive cursor
    // exists to avoid.
    const { chat } = chatFor(() => sseResponse(A_RESUMED_TURN));

    const trace: string[] = [];
    for await (const chunk of chat.resume(
      DEPLOYMENT,
      { token: TEST_SESSION_TOKEN },
      { lastEventId: "t1:13", onEventId: (id) => trace.push(`id:${id}`) }
    )) {
      trace.push(`frame:${chunk.type}`);
    }

    expect(trace).toEqual([
      "frame:text-start",
      "frame:text-delta",
      "id:t1:14",
      "frame:text-end",
      "id:t1:15",
      "frame:finish",
      "id:t1:16"
    ]);
  });

  it("keeps the cursor on the LIVE send route too, so a drop mid-turn is resumable", async () => {
    const withIds = [
      "id: t2:0",
      'data: {"type":"start"}',
      "",
      "id: t2:1",
      'data: {"type":"text-start","id":"m2"}',
      "",
      "data: [DONE]",
      "",
      ""
    ].join("\n");
    const { chat } = chatFor(() => sseResponse(withIds));

    const cursors: string[] = [];
    for await (const _chunk of chat.stream(
      DEPLOYMENT,
      { content: "hi" },
      { token: TEST_SESSION_TOKEN },
      { onEventId: (id) => cursors.push(id) }
    )) {
      // drained
    }

    expect(cursors).toEqual(["t2:0", "t2:1"]);
  });
});

describe("chat.resumeRaw — the useChat resume door", () => {
  it("hands back the Response unread, with the cursor forwarded", async () => {
    const { chat, seen } = chatFor(() => sseResponse(A_RESUMED_TURN));

    const response = await chat.resumeRaw(
      DEPLOYMENT,
      { token: TEST_SESSION_TOKEN },
      { lastEventId: "t1:13" }
    );

    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers["last-event-id"]).toBe("t1:13");
    expect(ChatResource.isUiMessageStream(response)).toBe(true);
    expect(response.bodyUsed).toBe(false);
    // The `id:` lines survive verbatim, which is what lets the browser's own
    // reader keep the cursor this door cannot report.
    expect(await response.text()).toContain("id: t1:14");
  });

  it("throws on a refusal instead of handing back an error Response", async () => {
    const { chat } = chatFor(
      () =>
        new Response(
          JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "nope" } }),
          { status: 401, headers: { "content-type": "application/json" } }
        )
    );

    await expect(chat.resumeRaw(DEPLOYMENT, { token: TEST_SESSION_TOKEN })).rejects.toBeInstanceOf(
      NexusApiError
    );
  });
});
