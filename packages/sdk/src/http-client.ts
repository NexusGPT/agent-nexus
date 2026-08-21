import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusError,
  NexusTimeoutError
} from "./errors";
import {
  checkResponse,
  type CompiledManifest,
  compileManifest,
  type ContractReporter
} from "./response-contract";
import { V1_RESPONSE_CONTRACT } from "./response-contract.generated";
import {
  decideRetry,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_TOTAL_RETRY_WAIT_MS,
  DEFAULT_RETRY_BASE_DELAY_MS,
  IDEMPOTENT_METHODS,
  isRetryableStatus,
  parseRetryAfterMs
} from "./retry-policy";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "./timeouts";
import type { PageResponse, PaginationMeta, WirePaginationMeta } from "./types/common";

// ============================================================================
// Types
// ============================================================================

/** Configuration options for the HTTP client. */
export interface HttpClientOptions {
  /** Base URL of the Nexus API (e.g. `"https://api.nexusgpt.io"`). */
  baseUrl: string;
  /**
   * Organization API key.
   *
   * OPTIONAL, and the one case that needs it absent is the one this SDK exists
   * to serve: a BROWSER holding only a chat-session token. Every chat route
   * takes its credential from {@link RequestOptions.chatSessionToken}, which
   * REPLACES this key rather than accompanying it, so a client that will only
   * ever stream a chat has nothing to put here — and putting a placeholder
   * there instead is worse than leaving it out, because a placeholder is
   * indistinguishable from a real key that has been revoked.
   *
   * 🔴 ABSENT IS NOT "UNAUTHENTICATED". A request that resolves to no
   * credential at all is refused HERE, by name, before a byte leaves the
   * process — see {@link HttpClient.credentialHeaders}. The failure a caller
   * gets is *"this client holds no organization API key"*, at the call site,
   * rather than a 401 from a route they then go and debug.
   *
   * `NexusClient` still requires one: it wires 40 resources, 38 of which have
   * no other credential, so a key-less `NexusClient` would be a client that
   * throws on almost everything. Use {@link createBrowserChatClient} for the
   * browser case.
   */
  apiKey?: string;
  /** Custom `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Additional headers sent with every request. */
  defaultHeaders?: Record<string, string>;
  /**
   * Request timeout in milliseconds. Applies to EACH attempt.
   *
   * Setting this states a deadline for EVERY request, long-running routes
   * included — it outranks the per-operation deadline a method declares for
   * itself. Leave it unset to get {@link DEFAULT_REQUEST_TIMEOUT_MS} for
   * ordinary routes and {@link LONG_RUNNING_TIMEOUT_MS} for the ones that run a
   * model; see `./timeouts.ts`.
   */
  timeout?: number;
  /**
   * How many times a transient failure may be replayed, on top of the first
   * attempt. Default {@link DEFAULT_MAX_RETRIES}; `0` disables retrying.
   *
   * Only requests whose method is idempotent are ever replayed — see
   * {@link IDEMPOTENT_METHODS}.
   */
  maxRetries?: number;
  /** Base backoff in milliseconds (default {@link DEFAULT_RETRY_BASE_DELAY_MS}). */
  retryBaseDelayMs?: number;
  /**
   * Ceiling on the SUM of every wait in one request's retry sequence, in
   * milliseconds. Default {@link DEFAULT_MAX_TOTAL_RETRY_WAIT_MS}.
   *
   * Bounds a `Retry-After` the server states. A stated wait that does not fit
   * what is left of this budget is REFUSED — the client stops and reports the
   * real number it was asked for — rather than being quietly capped to the
   * budget, which would send the next attempt while the block is provably still
   * live. `0` accepts no server-stated wait at all.
   */
  maxTotalRetryWaitMs?: number;
  /**
   * Called immediately before each wait, so a caller can tell a user that a
   * slow command is waiting rather than hung.
   *
   * The SDK writes nothing itself. A library that owns stderr is a library that
   * corrupts somebody's output eventually; the consumer decides where a notice
   * goes. A throw from this callback is swallowed — reporting a retry must never
   * be able to fail the request it is reporting on.
   */
  onRetry?: (notice: RetryNotice) => void;
  /**
   * Injectable sleep, so a test does not have to wait out the backoff. Defaults
   * to a real timer. Not part of the API surface a caller is expected to use.
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Injectable jitter source, so a test can pin a backoff delay exactly.
   * Defaults to `Math.random`. Not part of the API surface a caller is expected
   * to use.
   */
  random?: () => number;
  /**
   * Notified of what each read's payload had to say about itself, against the
   * shape its route publishes. See `./response-contract.ts`.
   *
   * Installing one is what turns the check ON. Absent, the manifest is never
   * consulted and this client behaves byte-for-byte as it did before — a
   * published SDK should not start spending cycles because it was upgraded.
   *
   * The reporter NEVER changes what a request returns. A mismatch is described
   * and the payload is handed back untouched, because substituting a parsed
   * value would strip every field the manifest does not know about, which is
   * the drift this exists to detect wearing the cure.
   *
   * A reporter that throws is caught and ignored: an observer must not be able
   * to fail a request that succeeded.
   */
  onResponseContract?: ContractReporter;
}

/**
 * Re-exported so the transport stays the one import a retry test needs, and so
 * an existing caller of `retryDelayMs` keeps resolving. The decisions themselves
 * live in `./retry-policy`, where they are pure and separately tested.
 */
export type { RetryDecision } from "./retry-policy";
export {
  decideRetry,
  IDEMPOTENT_METHODS,
  isRetryableStatus,
  parseRetryAfterMs,
  retryDelayMs
} from "./retry-policy";

/**
 * What one retry did, handed to {@link HttpClientOptions.onRetry}.
 *
 * A record rather than a formatted string: this SDK must not decide where the
 * notice goes. The CLI renders it on stderr — never stdout, where it would
 * corrupt the single JSON document `--json` promises — and a library consumer
 * may want a metric instead of a line of text.
 */
export interface RetryNotice {
  /** HTTP method of the request being replayed. */
  method: string;
  /** Absolute URL of the request being replayed. */
  url: string;
  /** Which retry this is: 1 for the first, 2 for the second. */
  attempt: number;
  /** How many attempts will be made in total before giving up. */
  maxAttempts: number;
  /** Status that triggered it, or `undefined` when the transport threw instead. */
  status: number | undefined;
  /** How long the client is about to wait, in milliseconds. */
  delayMs: number;
  /** `true` when `delayMs` came from a `Retry-After` header rather than the backoff curve. */
  statedByServer: boolean;
}

/**
 * A `Retry-After` the client declined to honour, because it did not fit the
 * remaining total-wait budget.
 *
 * Kept as the two raw numbers rather than a message, so the number the user is
 * shown is the number the server actually sent.
 */
export interface RetryRefusal {
  /** What the server asked us to wait, in milliseconds. */
  requestedMs: number;
  /** What was left of `maxTotalRetryWaitMs` when it asked, in milliseconds. */
  remainingBudgetMs: number;
}

/** What one call to `send` did, beyond the response itself. */
interface SendOutcome {
  res: Response;
  /** Attempts actually made, counting the first. `1` means nothing was retried. */
  attempts: number;
  /** Set only when a stated wait was declined. */
  refusal: RetryRefusal | undefined;
}

/** Whole seconds, for a message a human reads. `1.5` rather than `1.500`. */
function seconds(ms: number): string {
  return `${Math.round(ms / 100) / 10}s`;
}

/**
 * Fold what the retry loop learned into the error the caller is about to throw.
 *
 * One place rather than each `toApiError` site, so the wording cannot drift and
 * an error can never claim one attempt count on one route and another elsewhere.
 *
 * Both additions are conditional on having something to say: a request that
 * succeeded first time reports nothing, which keeps the common error message
 * byte-identical to what it was before retrying existed.
 */
function annotate(
  error: NexusApiError,
  attempts: number,
  refusal: RetryRefusal | undefined
): NexusApiError {
  if (refusal) {
    error.retryAfterMs = refusal.requestedMs;
    // Both halves of this sentence are conditional, because a fixed wording got
    // each one wrong in a different direction.
    //
    // `exceeded` — "exceeds the 0s left" is FALSE when the number asked for is
    // itself `0`, which a spent budget refuses. A spent budget is its own fact
    // and says so, rather than claiming a comparison that does not hold.
    //
    // `stopped` — "no retry was attempted" is false the moment earlier waits
    // have already run, and it then contradicts the `(gave up after N attempts)`
    // suffix appended immediately below. An error that states two contradictory
    // things about one request is worse than a terse one, because a reader has
    // to decide which half to disbelieve.
    const exceeded =
      refusal.remainingBudgetMs <= 0
        ? `and this client's retry budget is already spent`
        : `which exceeds the ${seconds(refusal.remainingBudgetMs)} left of this client's retry budget`;
    const stopped = attempts > 1 ? "no further retry was attempted" : "no retry was attempted";
    error.message =
      `${error.message} The server asked for ${seconds(refusal.requestedMs)} before a retry, ` +
      `${exceeded}, so ${stopped}. ` +
      `Raise \`maxTotalRetryWaitMs\` or run the command again later.`;
  }
  if (attempts > 1) {
    error.attempts = attempts;
    error.message = `${error.message} (gave up after ${attempts} attempts)`;
  }
  return error;
}

/**
 * The header a browser chat-session token travels in.
 *
 * Mirrors `CHAT_SESSION_TOKEN_HEADER` in the backend's chat-session decorator.
 * Spelled here rather than imported because this package publishes standalone
 * and depends on `@nexus/types` at build time only.
 */
export const CHAT_SESSION_TOKEN_HEADER = "x-chat-session-token";

/**
 * The response header a UI Message Stream carries, and its only value in `ai@7`.
 *
 * A stream that omits it is still readable frame by frame, so this is a WARNING
 * signal rather than a refusal: something between the pod and the client
 * rewrote the response, and a stock `useChat` transport will notice before you
 * do.
 */
export const UI_MESSAGE_STREAM_PROTOCOL_HEADER = "x-vercel-ai-ui-message-stream";

/** Options for a single HTTP request. */
export interface RequestOptions {
  /** Request body (will be JSON-serialized unless it's a `FormData` instance). */
  body?: unknown;
  /**
   * Query string parameters. `undefined` values are omitted.
   * Array values are sent as repeated keys (`?k=a&k=b`).
   */
  query?: Record<string, string | number | boolean | string[] | number[] | undefined>;
  /** Additional headers for this request. */
  headers?: Record<string, string>;
  /**
   * The deadline THIS operation needs, in milliseconds, when the caller has not
   * stated one of their own.
   *
   * Declared by the method that owns the route — a synchronous generation knows
   * it may take minutes, and the transport does not. Ignored whenever
   * `HttpClientOptions.timeout` is set, so an explicit caller deadline still
   * wins. See `./timeouts.ts` for why the two classes cannot share one number.
   */
  timeoutMs?: number;
  /**
   * Present a chat-session token INSTEAD of the organization API key.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * 🔴 IT REPLACES THE API KEY. IT DOES NOT ACCOMPANY IT.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * The server's `CompositeAuthGuard` tries its credentials in a fixed order and
   * the FIRST branch that matches short-circuits — api-key is tried before the
   * chat session. So a request carrying both authenticates as the API key,
   * `request.chatSession` is never written, and the handler's
   * `@CurrentChatSession()` throws `401 "Chat session is not valid."` — a
   * refusal that reads exactly like an expired token while the token is perfect.
   *
   * Measured on the live staging route 2026-08-20: a token that streamed
   * seconds earlier on its own answered 401 the moment an `api-key` header rode
   * along. That is why this is a REPLACEMENT rather than an extra header a
   * caller could add through {@link RequestOptions.headers}, and why
   * `chat-credential-is-exclusive.test.ts` asserts the absence of `api-key`
   * rather than the presence of this one.
   *
   * Mint one with `client.chat.createSession()`, which uses the org API key.
   */
  chatSessionToken?: string;
  /**
   * Called with an SSE record's `id:` field once that record's frame has been
   * consumed. `requestSSE` only.
   *
   * A frame iterator yields parsed `data:` payloads, so `id:` is otherwise
   * dropped — and on this API that field is the RESUME CURSOR, which makes its
   * absence the difference between a stream you can reattach to and one you can
   * only replay from the beginning.
   *
   * Two properties are deliberate and both are load-bearing:
   *
   * - **A record with no `id:` does not call this.** A resumed stream opens
   *   with a SYNTHESISED frame that reopens the block the cursor landed inside;
   *   it is not a log entry and must not move the reader's position.
   * - **It fires AFTER the frame is yielded**, so a consumer that throws mid
   *   frame has not advanced its own cursor past a frame it never handled.
   */
  onEventId?: (eventId: string) => void;
}

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: WirePaginationMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `{ success: true, data, meta? }` — the envelope every typed v1 route returns. */
function isSuccessEnvelope<T>(body: unknown): body is ApiSuccessEnvelope<T> {
  return isRecord(body) && body.success === true && "data" in body;
}

/**
 * The error to throw for a response, built from whatever body it carried.
 *
 * Three shapes reach this, in descending order of how much they tell us:
 * the v1 error envelope (`{ success: false, error: { code, message } }`), a
 * NestJS default error body (`{ statusCode, message, error }`), and anything
 * else — for which the status is all we can honestly report.
 */
function toApiError(status: number, body: unknown): NexusApiError {
  const envelope = isRecord(body) ? body : undefined;
  const err = isRecord(envelope?.error) ? envelope.error : undefined;

  if (err) {
    // `undefined` means THE SERVER SENT NO CODE, which is a different fact from
    // any placeholder we would substitute — and the two paths below want
    // DIFFERENT placeholders. Collapsing them here is what discarded the real
    // code on 401: it arrived already flattened to `HTTP_401`, so forwarding it
    // would have replaced one wrong constant with another.
    const serverCode = typeof err.code === "string" ? err.code : undefined;
    const message =
      typeof err.message === "string" ? err.message : `Request failed with status ${status}`;
    // A 401 carries the server's own code (AUTH_EXPIRED, REAUTH_REQUIRED, …) —
    // the only thing distinguishing "your API key is bad" from "a connected
    // provider's token expired". Absent one, the constructor's UNAUTHORIZED
    // stands, which is what every 401 already reported.
    return status === 401
      ? new NexusAuthenticationError(message, serverCode)
      : new NexusApiError(serverCode ?? `HTTP_${status}`, message, status, err.details);
  }

  const message =
    typeof envelope?.message === "string"
      ? envelope.message
      : `Request failed with status ${status}`;
  const serverCode = typeof envelope?.error === "string" ? envelope.error : undefined;

  return status === 401
    ? new NexusAuthenticationError(message, serverCode)
    : new NexusApiError(serverCode ?? `HTTP_${status}`, message, status);
}

/**
 * Serialize a request body and set the header it needs. `FormData` is passed
 * through untouched so the runtime can set its own multipart boundary.
 *
 * Returns `undefined` for a value `JSON.stringify` cannot represent (a function,
 * a symbol), which is what the caller then sends: no body.
 */
function serializeBody(
  body: unknown,
  headers: Record<string, string>
): string | FormData | undefined {
  if (body instanceof FormData) return body;
  headers["Content-Type"] = "application/json";
  return JSON.stringify(body);
}

/**
 * Read the response body as text.
 *
 * The timeout has already been cleared by the time this runs, so a stream that
 * fails mid-read (a reset connection) rejects here. That is a transport failure,
 * not a malformed payload, and it says so — otherwise the raw `TypeError` would
 * escape past every SDK error type the caller catches.
 */
async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch (err) {
    throw new NexusConnectionError(
      err instanceof Error ? err.message : "Failed to read the response body",
      err instanceof Error ? err : undefined
    );
  }
}

/**
 * The JSON carried by one SSE record's `data:` lines, or `undefined` when the
 * record carries none (a `: keepalive` comment, a blank tail) or does not parse.
 *
 * Multi-line `data:` is joined with newlines, as the SSE spec requires. The
 * Nexus streams write single-line frames today, but a client that silently
 * dropped the continuation of a multi-line one would corrupt a payload rather
 * than fail on it.
 */
function parseSSEData<T>(record: string): T | undefined {
  const payload = record
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");

  if (payload === "") return undefined;

  try {
    return JSON.parse(payload) as T;
  } catch {
    return undefined;
  }
}

/**
 * The `id:` field of one SSE record, or `undefined` when it carries none.
 *
 * `undefined` is a real answer here rather than a parse failure: the chat
 * resume stream deliberately opens with a synthesised frame that carries NO
 * `id:`, because it re-announces a block the reader is already inside and must
 * not move the reader's cursor. Defaulting a missing field to anything would
 * turn that design into a replayed opener.
 *
 * The LAST `id:` line wins, as the SSE specification requires — unlike `data:`,
 * which accumulates.
 */
function parseSSEEventId(record: string): string | undefined {
  let eventId: string | undefined;

  for (const line of record.split("\n")) {
    if (line.startsWith("id:")) eventId = line.slice("id:".length).trimStart();
  }

  return eventId;
}

/**
 * Hand one record's `id:` to the caller's cursor sink, if it has one.
 *
 * A throwing sink must not destroy a stream a caller has already half-rendered
 * — the same reason `parseSSEData` skips a malformed frame instead of throwing
 * on it — so the callback's own failure is swallowed here. It is a bookkeeping
 * hook, not a step in delivering the turn.
 */
function reportEventId(record: string, sink: ((eventId: string) => void) | undefined): void {
  if (sink === undefined) return;

  const eventId = parseSSEEventId(record);
  if (eventId === undefined) return;

  try {
    sink(eventId);
  } catch {
    // Deliberately ignored — see above.
  }
}

// ============================================================================
// HttpClient
// ============================================================================

/**
 * Low-level HTTP client for the Nexus Public API.
 *
 * Most users should use `NexusClient` instead, which provides typed resource
 * methods. The `HttpClient` is exported for advanced use cases (e.g. calling
 * endpoints not yet covered by the SDK).
 *
 * All requests are sent to `{baseUrl}/api/public/v1{path}` with the API key
 * in the `api-key` header.
 *
 * Success and failure are decided by the HTTP STATUS. A 2xx whose body is the
 * standard envelope (`{ success: true, data: T, meta?: WirePaginationMeta }`) is
 * unwrapped to its `data`; a 2xx whose body is anything else — a route speaking
 * its own protocol, such as the JSON-RPC of `POST /mcp` — is returned verbatim.
 * Only a non-2xx (or an explicit `success: false`) throws.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly defaultHeaders: Record<string, string>;
  /**
   * The caller's own deadline, or `undefined` when they stated none.
   *
   * Kept UNRESOLVED on purpose. Collapsing it to `opts.timeout ?? 30_000` in the
   * constructor is what made every long-running route unfixable: from that point
   * on "the caller wants 30 s" and "nobody said anything" are the same value, so
   * a method could not supply the minutes its own route needs without
   * overriding a deadline the caller may have set deliberately.
   */
  private readonly timeout: number | undefined;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxTotalRetryWaitMs: number;
  private readonly onRetry: ((notice: RetryNotice) => void) | undefined;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly onResponseContract: ContractReporter | undefined;
  /**
   * The manifest, indexed for matching.
   *
   * Built lazily and shared by every client, because compiling 448 routes for a
   * client that never reads a payload is work nobody asked for — and the module
   * is a `const`, so one index is correct for all of them.
   */
  private static compiledContract: CompiledManifest | undefined;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    // 🔴 `.bind(globalThis)` IS LOAD-BEARING IN A BROWSER AND INERT IN NODE, SO
    // EVERY NODE TEST PASSES WITHOUT IT.
    //
    // Stored unbound, `this.fetchFn(...)` invokes with `this` set to the
    // HttpClient. Node's `fetch` does not care what its receiver is. The DOM's
    // does: it is defined on `Window`/`WorkerGlobalScope` and REJECTS with
    // `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`.
    //
    // 🔴 IT REJECTS, IT DOES NOT THROW SYNCHRONOUSLY, and that distinction is
    // how this defect hides. `fetch` returns a Promise on every path, so a
    // probe that classifies by `try`/`catch` around the CALL sees nothing wrong
    // — the rejection arrives later, on a Promise nobody awaited. Only a
    // NON-nullish foreign receiver is refused; `undefined` and `null` coerce to
    // the global, which is why a bare `fetch(url)` is safe and an instance
    // method holding an unbound reference is not.
    //
    // So this line separates "works in jest, vitest, tsx, the CLI and the MCP
    // server" from "works in a browser", and nothing in the type system, the
    // conformance suite or the response-contract manifest can see the
    // difference — the signature is identical either way. Found 2026-08-20 by
    // rendering a real staging turn in chromium through `apps/chat-embed`,
    // which is the first browser consumer this client has ever had.
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = opts.defaultHeaders ?? {};
    this.timeout = opts.timeout;
    this.maxRetries = Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.retryBaseDelayMs = opts.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.maxTotalRetryWaitMs = Math.max(
      0,
      opts.maxTotalRetryWaitMs ?? DEFAULT_MAX_TOTAL_RETRY_WAIT_MS
    );
    this.onRetry = opts.onRetry;
    this.sleep =
      opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.random = opts.random ?? Math.random;
    this.onResponseContract = opts.onResponseContract;
  }

  /**
   * Describe one payload against the shape its route publishes, and hand the
   * description to the reporter.
   *
   * Returns nothing and changes nothing. Every failure mode here — no reporter,
   * no matching route, a reporter that throws — leaves the request exactly as
   * it was, because an observer that can break a successful read is worse than
   * no observer at all.
   */
  private reportContract(method: string, path: string, payload: unknown): void {
    const report = this.onResponseContract;
    if (!report) return;

    try {
      HttpClient.compiledContract ??= compileManifest(V1_RESPONSE_CONTRACT);
      report(checkResponse(HttpClient.compiledContract, method, path, payload));
    } catch {
      // Deliberately silent. The alternative is a diagnostic that can fail the
      // thing it is diagnosing.
    }
  }

  /**
   * Report that a read produced no payload to check.
   *
   * A read that examined nothing must not be silent, or a sink counting
   * verdicts would score it as if it had passed. It gets an `unchecked` verdict
   * naming the reason, exactly like a route that publishes no schema.
   */
  private reportUnread(method: string, path: string, reason: string): void {
    const report = this.onResponseContract;
    if (!report) return;
    try {
      report({ state: "unchecked", route: null, method: method.toUpperCase(), path, reason });
    } catch {
      // See `reportContract`.
    }
  }

  /**
   * The deadline this request runs under, in milliseconds.
   *
   * Three sources, in the order they outrank each other:
   *   1. the caller's `HttpClientOptions.timeout` — stated deliberately, wins
   *      over everything, and is what the CLI's `--timeout <seconds>` flag sets;
   *   2. the operation's own `timeoutMs` — what a synchronous generation needs;
   *   3. {@link DEFAULT_REQUEST_TIMEOUT_MS} — an ordinary read or write.
   */
  private deadlineFor(opts: RequestOptions): number {
    return this.timeout ?? opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * The ONE credential this request presents.
   *
   * Exactly one header comes back, never two, and that exclusivity is the whole
   * point — see {@link RequestOptions.chatSessionToken} for the 401 that a
   * request carrying both earns.
   *
   * It lives in one method so every door — `request`, `requestRaw`,
   * `requestWithMeta`, `requestSSE`, `openStream` — resolves the credential the
   * same way. Four copies of `"api-key": this.apiKey` is exactly how one of them
   * came to be unable to present anything else.
   */
  private credentialHeaders(opts: RequestOptions): Record<string, string> {
    if (opts.chatSessionToken !== undefined) {
      return { [CHAT_SESSION_TOKEN_HEADER]: opts.chatSessionToken };
    }
    if (this.apiKey === undefined) {
      // 🔴 REFUSE HERE, NEVER SEND AN UNCREDENTIALLED REQUEST. `apiKey` became
      // optional so a browser can hold a chat-session token and nothing else
      // (see HttpClientOptions.apiKey). The cost of that is a client which can
      // reach a route it cannot authenticate, and the two ways that could
      // surface are not equal: sending the request earns a 401 that reads like
      // an expired credential and sends the caller to the server, while this
      // throw names the actual cause at the line that caused it.
      throw new NexusError(
        "This client holds no organization API key, so it can only call routes that " +
          "take a chat-session token. Construct it with `apiKey`, or use " +
          "`createBrowserChatClient()` and stay on the chat routes."
      );
    }
    return { "api-key": this.apiKey };
  }

  /**
   * Perform one attempt: fetch under the per-attempt timeout, mapping a
   * transport failure onto the SDK's own error types.
   */
  private async attempt(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // The deadline actually waited, not the transport's default — the CLI
        // prints this number back to the user as the wait it just performed.
        throw new NexusTimeoutError(timeoutMs);
      }
      throw new NexusConnectionError(
        err instanceof Error ? err.message : "Network request failed",
        err instanceof Error ? err : undefined
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Send a request, replaying a failure the server or the transport says is
   * worth replaying.
   *
   * Three things can be retried here, and they do NOT share a rule:
   *
   *  - a **429**, for any method. The server states it refused the request, so
   *    nothing ran and nothing can be duplicated. Its `Retry-After` outranks our
   *    backoff.
   *  - a **proxy 5xx** ({@link PROXY_STATUSES}), for idempotent methods only.
   *    The outcome is ambiguous — the upstream may have applied it.
   *  - a **dropped connection**, for idempotent methods only, for the same
   *    reason. It arrives as a thrown {@link NexusConnectionError} rather than a
   *    `Response`, which is why the decision cannot live at the call sites.
   *
   * A {@link NexusTimeoutError} is deliberately NOT retried even though it is a
   * subclass of the connection error. The caller stated a deadline; spending it
   * two more times over is not what they asked for, and unlike a 502 the server
   * may still be processing the request.
   *
   * A discarded response has its body cancelled before the next attempt. Node
   * pins the connection in the undici pool until a body is consumed or
   * cancelled, so dropping the response object on the floor leaks one socket per
   * retry — invisible to every gate, and worst under exactly the load that
   * triggers a retry in the first place.
   */
  private async send(
    method: string,
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<SendOutcome> {
    // The attempt cap no longer depends on the method: a 429 is replayable for
    // every method, so a POST needs a budget of attempts too. What the method
    // decides is whether a given FAILURE is replayable — `isRetryableStatus`
    // for a status, `IDEMPOTENT_METHODS` for a dropped connection.
    const maxAttempts = this.maxRetries + 1;
    const idempotent = IDEMPOTENT_METHODS.has(method.toUpperCase());
    let budgetMs = this.maxTotalRetryWaitMs;

    for (let n = 1; ; n++) {
      const isLast = n === maxAttempts;
      let status: number | undefined;
      let retryAfterMs: number | undefined;
      let lastError: unknown;

      try {
        const res = await this.attempt(url, init, timeoutMs);
        if (isLast || !isRetryableStatus(res.status, method)) {
          return { res, attempts: n, refusal: undefined };
        }
        status = res.status;
        retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));

        const decision = decideRetry(n, retryAfterMs, budgetMs, this.retryBaseDelayMs, this.random);
        if (decision.kind === "exhausted") {
          return { res, attempts: n, refusal: undefined };
        }
        if (decision.kind === "refused") {
          // Stop on the response we already have, so the caller still builds its
          // error from the server's own body. The refusal travels beside it and
          // carries the REAL number the server asked for — a silently capped
          // wait would read to the user as the server having asked for less.
          return {
            res,
            attempts: n,
            refusal: {
              requestedMs: decision.requestedMs,
              remainingBudgetMs: decision.remainingBudgetMs
            }
          };
        }

        await res.body?.cancel().catch(() => undefined);
        await this.waitBeforeRetry(decision.delayMs, decision.statedByServer, {
          method,
          url,
          attempt: n,
          maxAttempts,
          status
        });
        budgetMs -= decision.delayMs;
        continue;
      } catch (err) {
        if (
          isLast ||
          !idempotent ||
          err instanceof NexusTimeoutError ||
          !(err instanceof NexusConnectionError)
        ) {
          throw err;
        }
        lastError = err;
      }

      // Transport failure: there is no response, so there is no `Retry-After`
      // and the wait can only come from the backoff curve.
      const decision = decideRetry(n, undefined, budgetMs, this.retryBaseDelayMs, this.random);
      // No response to hand back on this path — the last attempt threw — so an
      // exhausted budget rethrows what the transport gave us.
      if (decision.kind !== "retry") throw lastError;
      await this.waitBeforeRetry(decision.delayMs, decision.statedByServer, {
        method,
        url,
        attempt: n,
        maxAttempts,
        status: undefined
      });
      budgetMs -= decision.delayMs;
    }
  }

  /**
   * Announce the wait, then perform it.
   *
   * The notice fires BEFORE the sleep — a message that arrives after a 40 s wait
   * explains nothing, because the user has already decided the command is hung.
   * A throw from the consumer's callback is swallowed: reporting a retry must
   * never be able to fail the request it is reporting on.
   */
  private async waitBeforeRetry(
    delayMs: number,
    statedByServer: boolean,
    about: Pick<RetryNotice, "method" | "url" | "attempt" | "maxAttempts" | "status">
  ): Promise<void> {
    if (this.onRetry) {
      try {
        this.onRetry({ ...about, delayMs, statedByServer });
      } catch {
        // Deliberately ignored. See the docblock.
      }
    }
    await this.sleep(delayMs);
  }

  /**
   * Make a request and return the unwrapped `data` field.
   *
   * @param method - HTTP method (GET, POST, PATCH, DELETE).
   * @param path - API path relative to `/api/public/v1` (e.g. `"/agents"`).
   * @param opts - Optional body, query params, and headers.
   * @returns The response `data` field, typed as `T`.
   * @throws {NexusAuthenticationError} On 401 responses.
   * @throws {NexusApiError} On other error responses.
   * @throws {NexusConnectionError} On network failures or timeouts.
   */
  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const { data } = await this.requestWithMeta<T>(method, path, opts);
    return data;
  }

  /**
   * Make a request and return the raw response text.
   * Useful for endpoints that return non-JSON responses (e.g. CSV exports).
   */
  async requestRaw(method: string, path: string, opts: RequestOptions = {}): Promise<string> {
    const url = new URL(`${this.baseUrl}/api/public/v1${path}`);

    if (opts.query) {
      appendQuery(url, opts.query);
    }

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...opts.headers,
      ...this.credentialHeaders(opts)
    };

    // `RequestOptions` advertises a body, so send it. It used to be dropped
    // silently here, which turned any non-GET raw call into a request the
    // server saw as empty.
    const requestBody = opts.body === undefined ? undefined : serializeBody(opts.body, headers);

    const fetchInit: RequestInit = {
      method,
      headers,
      ...(requestBody === undefined ? {} : { body: requestBody })
    };

    const { res, attempts, refusal } = await this.send(
      method,
      url.toString(),
      fetchInit,
      this.deadlineFor(opts)
    );

    const text = await readBody(res);

    if (!res.ok) {
      // Best-effort: an error body is usually the v1 envelope even on a route
      // whose success payload is not JSON, and its message beats the status.
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      throw annotate(toApiError(res.status, parsed), attempts, refusal);
    }

    return text;
  }

  /**
   * Open a streaming response and hand back the `Response` ITSELF, unread.
   *
   * ## Why a `Response` and not frames
   *
   * `requestSSE` decodes and parses, which is what a terminal or a bespoke
   * renderer wants. A customer proxying our chat route to their own browser
   * wants the OPPOSITE: the bytes untouched, so `ai`'s own transport reads the
   * stream it was written against — including the headers, which
   * `x-vercel-ai-ui-message-stream` lives in and which a frame iterator has
   * already thrown away.
   *
   * ```ts
   * // A Next.js route handler proxying to Nexus, in five lines.
   * const upstream = await client.chat.streamRaw(deploymentId, body, { token });
   * return new Response(upstream.body, { headers: upstream.headers });
   * ```
   *
   * ## What it does and does not do for you
   *
   * A non-2xx is mapped and THROWN, exactly as every other door maps one — a
   * refusal happens before the stream opens, so its body is ordinary JSON and
   * handing the caller an un-inspected error `Response` would make them
   * re-implement `toApiError`. A 2xx comes back verbatim: no decoding, no
   * `getReader`, nothing consumed.
   *
   * 🔴 **THE CALLER OWNS THE BODY FROM HERE.** Nothing in this client cancels
   * it. A caller that abandons the response without reading or cancelling it
   * pins the connection in the undici pool until the process exits.
   */
  async openStream(method: string, path: string, opts: RequestOptions = {}): Promise<Response> {
    const url = new URL(`${this.baseUrl}/api/public/v1${path}`);

    if (opts.query) {
      appendQuery(url, opts.query);
    }

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...opts.headers,
      ...this.credentialHeaders(opts),
      Accept: "text/event-stream"
    };

    const fetchInit: RequestInit = { method, headers };

    if (opts.body !== undefined) {
      const serialized = serializeBody(opts.body, headers);
      if (serialized !== undefined) fetchInit.body = serialized;
    }

    const { res, attempts, refusal } = await this.send(
      method,
      url.toString(),
      fetchInit,
      this.deadlineFor(opts)
    );

    if (!res.ok) {
      // The failure path is ordinary JSON — a refusal happens before the stream
      // opens, by construction on the server side — so it is read and mapped the
      // same way every other error is.
      const text = await readBody(res);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      throw annotate(toApiError(res.status, parsed), attempts, refusal);
    }

    if (!res.body) {
      throw new NexusConnectionError("Streaming response carried no body");
    }

    // The THIRD read boundary of this client, and the one nothing can check.
    //
    // A frame is not the payload a descriptor describes: the v1 contract
    // publishes a schema for a route's `data`, and a stream has no `data` — it
    // has a sequence of deltas whose shape the contract never states. So there
    // is nothing to compare a frame against, and there will not be until a
    // per-frame schema exists.
    //
    // Reported ONCE per stream rather than per frame, because one agent turn is
    // thousands of frames and a sink drowned in them stops being read. Reported
    // at all because an unexamined read must not be silent — a sink counting
    // verdicts would otherwise score this stream as if it had passed.
    this.reportUnread(
      method,
      path,
      "the route streams server-sent events, and the contract publishes no per-frame schema"
    );

    return res;
  }

  /**
   * Make a request and yield each `data:` frame of a `text/event-stream`
   * response as it arrives.
   *
   * ## Why this is not `requestRaw`
   *
   * `requestRaw` awaits `res.text()`, which resolves only when the server closes
   * the body. On an endpoint that streams a live agent turn that is the exact
   * behaviour the caller is trying to escape: it would buffer every token and
   * hand them over at the end, indistinguishable from the blocking POST.
   *
   * ## Timeouts
   *
   * The per-attempt timeout bounds the WAIT FOR HEADERS only — `attempt` clears
   * its timer as soon as `fetch` resolves, which for a streaming response is
   * before the first frame. A turn may then run for minutes without tripping the
   * client's 30s default, which is what makes this usable; the server's own
   * keepalive comments are what keep intermediaries from closing it.
   *
   * That deadline still has to be HANDED to `send`. Left off, the timer is armed
   * as `setTimeout(…, undefined)` — it fires on the next tick and aborts the
   * request before its headers can arrive, so every stream fails as a timeout on
   * a real network while a stub `fetch` that resolves instantly wins the race.
   *
   * ## Termination
   *
   * The generator ends when the server closes the body. A caller that leaves the
   * loop early (`break`, `return`, a throw) cancels the underlying reader
   * through the generator's `finally`, so abandoning a stream does not leak the
   * connection — the turn keeps running server-side and its result is still
   * persisted to the conversation.
   *
   * Malformed frames are SKIPPED rather than thrown on: one unparseable line in
   * a long stream should not destroy the turn a caller has already half-rendered.
   */
  async *requestSSE<T>(
    method: string,
    path: string,
    opts: RequestOptions = {}
  ): AsyncGenerator<T, void, undefined> {
    const res = await this.openStream(method, path, opts);

    // `openStream` refuses a body-less response, so this is a narrowing for the
    // compiler rather than a second check.
    if (!res.body) {
      throw new NexusConnectionError("Streaming response carried no body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        // `stream: true` so a multi-byte character split across two chunks is
        // held rather than decoded into a replacement character — an emoji in a
        // token delta lands on a chunk boundary often enough to matter.
        buffer += decoder.decode(value, { stream: true });

        // SSE records are separated by a blank line. The trailing element is
        // whatever has arrived since the last one and is deliberately kept.
        const records = buffer.split("\n\n");
        buffer = records.pop() ?? "";

        for (const record of records) {
          const frame = parseSSEData<T>(record);
          if (frame === undefined) continue;
          yield frame;
          reportEventId(record, opts.onEventId);
        }
      }

      const last = parseSSEData<T>(buffer);
      if (last !== undefined) {
        yield last;
        reportEventId(buffer, opts.onEventId);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  /**
   * Make a request and return `{ data, meta }` (useful for paginated lists).
   *
   * @param method - HTTP method.
   * @param path - API path relative to `/api/public/v1`.
   * @param opts - Optional body, query params, and headers.
   * @returns The response `data` and the raw pagination `meta`, unnormalized.
   * @throws {NexusAuthenticationError} On 401 responses.
   * @throws {NexusApiError} On other error responses.
   * @throws {NexusConnectionError} On network failures or timeouts.
   */
  async requestWithMeta<T>(
    method: string,
    path: string,
    opts: RequestOptions = {}
  ): Promise<{ data: T; meta?: WirePaginationMeta }> {
    const url = new URL(`${this.baseUrl}/api/public/v1${path}`);

    if (opts.query) {
      appendQuery(url, opts.query);
    }

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...opts.headers,
      ...this.credentialHeaders(opts),
      Accept: "application/json"
    };

    const fetchInit: RequestInit = { method, headers };

    if (opts.body !== undefined) {
      const serialized = serializeBody(opts.body, headers);
      if (serialized !== undefined) fetchInit.body = serialized;
    }

    const { res, attempts, refusal } = await this.send(
      method,
      url.toString(),
      fetchInit,
      this.deadlineFor(opts)
    );

    // Handle 204 No Content (e.g. DELETE responses)
    if (res.status === 204) {
      // `{}` here is SYNTHESIZED by this client, not read off the wire, so
      // checking it would report every field of a declared shape as missing.
      // Say nothing was checked rather than manufacture a verdict about a
      // payload that does not exist.
      this.reportUnread(method, path, "the response carried no body (204)");
      return { data: {} as T, meta: undefined };
    }

    const rawBody = await readBody(res);

    // An empty body is not a parse failure. A 2xx that sends nothing succeeded
    // with nothing to report — POST /mcp answers a JSON-RPC *notification*
    // exactly that way: 200 with no body, by protocol.
    if (rawBody.trim() === "") {
      if (res.ok) {
        this.reportUnread(method, path, "the response body was empty");
        return { data: {} as T, meta: undefined };
      }
      throw annotate(toApiError(res.status, undefined), attempts, refusal);
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      // Annotated like every other throw in this method, and this is the arm
      // that needs it MOST rather than least. A retry sequence that exhausts
      // itself against a proxy ends on the proxy's own error page — 502/503/504
      // are served as HTML by nearly every load balancer — so the unparseable
      // body IS the common terminal state of a retried request, not an exotic
      // one. Left bare, `attempts` and `retryAfterMs` were dropped on exactly
      // the failures this client retried hardest, while the empty-body 502 one
      // arm above reported them in full.
      throw annotate(
        new NexusApiError(
          "PARSE_ERROR",
          `Failed to parse response body (status ${res.status})`,
          res.status
        ),
        attempts,
        refusal
      );
    }

    // The HTTP STATUS decides success or failure — not the body's shape.
    //
    // This client used to key that decision off `json.success`, which made every
    // 2xx response that is not a v1 envelope look like an error: the body was
    // discarded and the caller got `Request failed with status 201`. That closed
    // off POST /mcp entirely (JSON-RPC 2.0 has its own response shape, and a
    // NestJS POST answers 201 unless the handler carries `@HttpCode`), so
    // `nexus api` could not reach the one endpoint that has no typed command at
    // all. See NEX-3021.
    //
    // POST /mcp answers 200 today, and that is exactly why the 201 fixtures in
    // this client's tests must stay: most other v1 POSTs still answer 201, so
    // the status this client must tolerate is any 2xx, never a list of numbers.
    if (res.ok) {
      if (isSuccessEnvelope<T>(json)) {
        this.reportContract(method, path, json.data);
        return { data: json.data, meta: json.meta };
      }
      // An explicit `success: false` is the server declaring failure; honor it
      // even on a 2xx rather than handing a caller an error body as data.
      if (isRecord(json) && json.success === false) {
        throw annotate(toApiError(res.status, json), attempts, refusal);
      }
      // Any other 2xx body belongs to a route that speaks its own protocol.
      // Hand it back verbatim — that is what a passthrough owes its caller.
      this.reportContract(method, path, json);
      return { data: json as T, meta: undefined };
    }

    throw annotate(toApiError(res.status, json), attempts, refusal);
  }

  /**
   * Make a request to a paginated list endpoint and return a complete
   * {@link PageResponse}.
   *
   * `requestWithMeta` types `meta` as OPTIONAL, because most endpoints do not
   * return it, while `PageResponse.meta` is REQUIRED. Every list method used to
   * bridge that gap with a `meta: meta!` non-null assertion — 20 of them, one
   * per resource — which told the compiler the field was present without
   * checking, and left `meta` genuinely `undefined` at runtime whenever the
   * server omitted it. The type said one thing and the value was another.
   *
   * This method closes the gap in ONE place instead. When the server omits
   * `meta`, it derives one that honestly describes the payload it did send: a
   * single complete page. That is a real value of the right shape rather than a
   * lie, so callers reading `meta.total` or `meta.hasMore` cannot crash.
   *
   * A PARTIAL `meta` gets the same treatment, because `meta ?? default` only
   * fires when `meta` is missing wholesale. Every v1 list endpoint currently
   * sends `hasMore`, so this derivation is a no-op today and is a fallback, not
   * a fix: `withDerivedHasMore` returns a served `hasMore` untouched. It exists
   * so that an endpoint which later omits the field degrades to a computed
   * boolean rather than leaving `undefined` behind a type that says `boolean`.
   *
   * What genuinely varies is the REST of the meta. `/agents` sends
   * `{ total, page, hasMore }`; `/assets` sends `limit` and `totalPages` as
   * well. {@link WirePaginationMeta} models that, so reading `meta.limit` is a
   * checked optional rather than an assumption.
   *
   * @param method - HTTP method.
   * @param path - API path relative to `/api/public/v1`.
   * @param opts - Optional body, query params, and headers.
   * @returns The page items and its pagination metadata.
   * @throws {NexusAuthenticationError} On 401 responses.
   * @throws {NexusApiError} On other error responses.
   * @throws {NexusConnectionError} On network failures or timeouts.
   */
  async requestPage<T>(
    method: string,
    path: string,
    opts: RequestOptions = {}
  ): Promise<PageResponse<T>> {
    const { data, meta } = await this.requestWithMeta<T[]>(method, path, opts);

    if (!meta) {
      return { data, meta: { total: data.length, page: 1, hasMore: false } };
    }

    return { data, meta: withDerivedHasMore(meta) };
  }
}

/**
 * Fill in a `hasMore` the server did not send.
 *
 * `page < totalPages` is the same expression the endpoints that DO send
 * `hasMore` compute it with, so a derived value and a served one agree. When
 * `totalPages` is missing too, `page * limit < total` says the same thing from
 * the other three fields. With none of them available the honest answer is
 * `false`: nothing in the payload suggests another page exists.
 */
export function withDerivedHasMore(meta: WirePaginationMeta): PaginationMeta {
  const { total, page, hasMore, limit, totalPages } = meta;

  if (hasMore !== undefined) {
    return { ...meta, hasMore };
  }
  if (totalPages !== undefined) {
    return { ...meta, hasMore: page < totalPages };
  }
  if (limit !== undefined) {
    return { ...meta, hasMore: page * limit < total };
  }
  return { ...meta, hasMore: false };
}

function appendQuery(
  url: URL,
  query: Record<string, string | number | boolean | string[] | number[] | undefined>
): void {
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, String(item));
    } else {
      url.searchParams.set(k, String(v));
    }
  }
}
