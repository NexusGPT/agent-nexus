import { afterEach, describe, expect, it } from "vitest";

import { createBrowserChatClient } from "./browser-chat";
import { HttpClient } from "./http-client";

/**
 * The DOM brand-checks the `fetch` receiver; Node does not.
 *
 * ## Why this file exists rather than an assertion inside `http-client.test.ts`
 *
 * `globalThis.fetch` in Node is an ordinary function that never inspects its
 * receiver, so EVERY existing test in this package passes whether or not
 * `HttpClient` binds it. The browser's `fetch` is a `Window` method and REJECTS
 * with `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`
 * when invoked with a non-nullish foreign `this` — which is exactly what
 * `this.fetchFn(url, …)` does when the reference was stored unbound.
 *
 * So the defect is INVISIBLE to this whole suite, to `tsc` (the signature is
 * identical either way), to the response-contract manifest and to every
 * conformance gate. It was found by rendering a real staging turn in chromium.
 *
 * 🔴 THE DOUBLE BELOW IS THE WHOLE TEST, AND IT REJECTS RATHER THAN THROWING.
 * That is not a detail. `fetch` returns a Promise on every path, so the browser
 * reports this failure as a REJECTION and never as a synchronous throw — a
 * probe that classifies by `try`/`catch` around the call reads a refused
 * receiver as success and moves on. A double that threw synchronously would
 * still catch the mutant here (both land in the same `catch` inside `attempt`),
 * but it would assert a shape the browser never produces, and the next person
 * to read it would learn the wrong failure mode.
 *
 * ⚠️ NULLISH IS NOT FOREIGN. `undefined` and `null` both coerce to the global
 * per WebIDL, so a bare `fetch(url)` is correct and only an object or class
 * instance is refused. The double mirrors that exactly; widening it to refuse
 * `null` would red a call the browser accepts.
 */

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A `fetch` that refuses a foreign receiver, the way the DOM's does. */
function installReceiverCheckingFetch(): { calls: number } {
  const state = { calls: 0 };
  function domLikeFetch(this: unknown): Promise<Response> {
    // Nullish coerces to the global (WebIDL), so only a real foreign receiver
    // is refused — and it is refused by REJECTING, never by throwing.
    if (this !== globalThis && this !== undefined && this !== null) {
      return Promise.reject(
        new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation")
      );
    }
    state.calls += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
  }
  globalThis.fetch = domLikeFetch as unknown as typeof globalThis.fetch;
  return state;
}

describe("HttpClient survives a fetch that checks its receiver", () => {
  it("does not invoke the global fetch with itself as the receiver", async () => {
    const state = installReceiverCheckingFetch();
    const client = new HttpClient({ baseUrl: "https://example.invalid", apiKey: "k" });

    await expect(client.request("GET", "/probe")).resolves.toBeDefined();
    expect(state.calls).toBe(1);
  });

  it("holds for the browser chat client, which passes no fetch of its own", async () => {
    const state = installReceiverCheckingFetch();
    const chat = createBrowserChatClient({ baseUrl: "https://example.invalid" });

    // `createSession` is the one chat method that needs the org API key, so it
    // is refused before any request is built. That refusal must be the NAMED
    // credential error — never an illegal-invocation TypeError, which would
    // mean the receiver bug had merely moved.
    await expect(chat.createSession("d")).rejects.toThrow(/holds no organization API key/);
    expect(state.calls).toBe(0);
  });

  it("CONTROL: the double really does refuse a foreign receiver, by REJECTING", async () => {
    installReceiverCheckingFetch();
    const detached = globalThis.fetch;
    const host = { detached };
    // Called as a method of something that is not the global — the exact shape
    // `this.fetchFn(...)` produces. Without this control a bound and an unbound
    // client are indistinguishable, because both simply pass.
    //
    // 🔴 `rejects`, NOT `toThrow`. A synchronous-throw assertion here would be
    // the same mistake the subject makes: `fetch` hands back a Promise on every
    // path, so a control that only watches for a throw validates a channel the
    // real API never uses, and reports a refused receiver as fine.
    await expect(host.detached("https://example.invalid")).rejects.toThrow(/Illegal invocation/);
  });

  it("CONTROL: a NULLISH receiver is accepted, because it coerces to the global", async () => {
    // The other direction, and it is the arm that would silently over-refuse:
    // a bare `fetch(url)` in strict ESM has `this === undefined`, which the
    // browser accepts. A double that refused it would red correct code.
    const state = installReceiverCheckingFetch();
    const detached = globalThis.fetch;

    await expect(detached("https://example.invalid")).resolves.toBeDefined();
    await expect(detached.call(null, "https://example.invalid")).resolves.toBeDefined();
    expect(state.calls).toBe(2);
  });
});
