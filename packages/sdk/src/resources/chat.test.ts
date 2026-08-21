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
