import type { DeprecationNotice } from "./deprecation";
import { HttpClient, type RetryNotice } from "./http-client";
import { ChatResource } from "./resources/chat";
import type { ContractReporter, RouteShapeManifest } from "./response-contract";

/**
 * How a browser reaches the chat routes, and nothing else.
 *
 * ## Why this exists rather than `new NexusClient({ apiKey })`
 *
 * `NexusClient` requires an organization API key and throws without one. That
 * is correct for it: it wires forty resources and thirty-eight of them have no
 * other credential, so a key-less `NexusClient` would be a client that throws
 * on almost everything it offers.
 *
 * A browser has the opposite shape. It holds ONE short-lived chat-session
 * token, minted server-side by `client.chat.createSession()` on a machine the
 * visitor never sees, and it must reach exactly one route with it. Before this
 * factory the only ways to do that were to construct `HttpClient` with a
 * PLACEHOLDER api key — a lie that is indistinguishable from a revoked real
 * key the day it starts failing — or to abandon the SDK and hand-roll `fetch`,
 * which gives up the retry policy, the error mapping, the SSE framing and the
 * contract reporter all at once.
 *
 * ## What it can and cannot do
 *
 * It returns a {@link ChatResource} and no client, deliberately: the type is
 * the boundary. Every method that takes a token per call works — `refresh()`,
 * `stream()`, `streamRaw()`, `resume()`, `resumeRaw()`, `stop()`, `status()`
 * and `uploadAttachments()`, which is the only door that MINTS a
 * `knowledgeIds` value for `stream()` to consume.
 * `createSession()` is on the same object and will THROW by name — it mints
 * with the org API key, which is the one credential that must never reach a
 * browser, so the refusal is the contract rather than a gap.
 *
 * ```ts
 * const chat = createBrowserChatClient({ baseUrl: "https://api.nexusgpt.io" });
 *
 * // `token` came from YOUR server, which called client.chat.createSession().
 * for await (const chunk of chat.stream(deploymentId, { content: text }, { token })) {
 *   if (chunk.type === "text-delta") append(chunk.delta);
 * }
 * ```
 *
 * ## The four a real chat UI needs beyond `stream()`
 *
 * A page is reloaded, a tab sleeps, a visitor changes their mind. `stop()` is
 * the Stop button, `status()` answers "is a turn still running" after a
 * reload, `resume()` reattaches to a turn already in flight, and `refresh()`
 * trades a stale token for a successor addressing the SAME conversation — all
 * on the same session token, all reachable from the browser.
 *
 * 🔴 A 401 from a chat route means that TOKEN is finished — expired, revoked,
 * wrong deployment or forged all answer identically, on purpose. Never retry
 * the same one. Call `refresh()` instead: it is the only route that accepts an
 * expired token, and it keeps the conversation. Ask your own server for a
 * fresh mint only when `refresh()` is refused too, which is the session's
 * absolute renewal ceiling being reached rather than a token going stale.
 */
export interface BrowserChatClientOptions {
  /**
   * Base URL of the Nexus API — the ORIGIN only, e.g.
   * `"https://api.nexusgpt.io"`. The `/api/public/v1` prefix is added by the
   * transport.
   *
   * 🚨 In a bundled browser app this is inlined at BUILD time. Changing it in a
   * hosting dashboard without rebuilding changes nothing: the shipped bundle
   * still carries the old string. Grep the built output to prove which value
   * reached it.
   */
  baseUrl: string;
  /** Custom `fetch`. Defaults to the global one. */
  fetch?: typeof globalThis.fetch;
  /**
   * Per-attempt deadline in milliseconds.
   *
   * ⚠️ For a stream this bounds the wait for HEADERS, not the turn. The
   * deadline is cleared once `fetch` resolves, and a model turn happens after
   * the SSE headers have flushed — so a long answer is never cut by it.
   */
  timeout?: number;
  /** Additional headers sent with every request. */
  defaultHeaders?: Record<string, string>;
  /**
   * Called immediately before each retry wait, so the page can say that a
   * message is still being delivered rather than leaving a visitor in front of
   * a UI that has gone quiet.
   *
   * 🔴 THIS IS THE ONLY WAY A BROWSER EMBED LEARNS A REQUEST WAS REPLAYED AT
   * ALL. `DEFAULT_MAX_RETRIES` is 2 and this factory passes no `maxRetries`, so
   * a transient failure is replayed twice on every chat call — and without a
   * callback here the whole sequence is invisible: the consumer sees one slow
   * success, or one failure after three attempts, with nothing to distinguish
   * either from a single attempt. The notice carries the attempt number, the
   * total, the status that triggered it and the wait about to be taken.
   *
   * The SDK writes nothing itself — a library that owns the console is a
   * library that pollutes somebody's telemetry eventually, so where the notice
   * goes is the consumer's call. A throw from this callback is swallowed:
   * reporting a retry must never be able to fail the request it is reporting
   * on.
   *
   * @see HttpClientOptions.onRetry
   */
  onRetry?: (notice: RetryNotice) => void;
  /**
   * Called when a response carries `Deprecation` and/or `Sunset`, so an embed
   * shipped inside somebody else's product learns that a chat route it depends
   * on is being removed while the lead time those headers exist to give is
   * still there.
   *
   * Observed once per response inside the transport's single `send`, so every
   * door of the returned {@link ChatResource} is covered — `stream()`,
   * `resume()`, `stop()`, `status()` and `refresh()` alike. A retried request
   * reports per attempt, because each attempt is a response.
   *
   * 🔴 NO NOTICE MEANS THE RESPONSE SAID NOTHING — never that the route is
   * current. A guard rejection answers with neither header, and a 401 is the
   * commonest answer a browser gets, since that is how a finished token is
   * reported.
   *
   * @see HttpClientOptions.onDeprecation
   */
  onDeprecation?: (notice: DeprecationNotice) => void;
  /**
   * Notified of what each read's payload had to say about itself, against the
   * shape its route publishes. See `./response-contract.ts`.
   *
   * Installing one is what turns the check ON; with none, nothing is consulted
   * and this client behaves byte-for-byte as it did before. It NEVER changes
   * what a call returns — a mismatch is described and the payload handed back
   * untouched. A reporter that throws is caught and ignored.
   *
   * A reporter alone checks nothing. {@link responseContract} is what it is
   * checked against.
   */
  onResponseContract?: ContractReporter;
  /**
   * The manifest {@link onResponseContract} scores payloads against.
   *
   * ```ts
   * import { V1_RESPONSE_CONTRACT } from "@agent-nexus/sdk/v1-response-contract";
   * ```
   *
   * 🚨 SUPPLIED, NEVER BUNDLED — and in a browser that is the whole reason it
   * is an option rather than an import. The published v1 manifest is the
   * largest thing this package ships, so it sits behind its own entry point: an
   * embed that imports it pays those bytes in the shipped bundle, and one that
   * does not pays nothing. This module imports it nowhere, deliberately.
   *
   * Absent while a reporter IS installed, every read comes back `unchecked`
   * with that import named as the reason — an observer that observes nothing,
   * which reads as working. That silence is deliberate: a quiet return would be
   * indistinguishable from a contract that passed, which is the drift the
   * feature exists to detect.
   */
  responseContract?: RouteShapeManifest;
}

/**
 * Build a chat-only client for a browser holding a session token.
 *
 * See {@link BrowserChatClientOptions} for the whole design note.
 */
export function createBrowserChatClient(opts: BrowserChatClientOptions): ChatResource {
  const http = new HttpClient({
    baseUrl: opts.baseUrl,
    fetch: opts.fetch,
    timeout: opts.timeout,
    defaultHeaders: opts.defaultHeaders,
    onRetry: opts.onRetry,
    onDeprecation: opts.onDeprecation,
    onResponseContract: opts.onResponseContract,
    responseContract: opts.responseContract
    // No `apiKey`, and that is the whole point. `HttpClient.credentialHeaders`
    // refuses any request that resolves to no credential, by name, before the
    // request is built — so `createSession()` on the returned resource throws
    // at the call site instead of earning a 401 the caller has to diagnose.
  });

  return new ChatResource(http);
}
