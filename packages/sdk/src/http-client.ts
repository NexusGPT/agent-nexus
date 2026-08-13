import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError
} from "./errors";
import type { PageResponse, PaginationMeta, WirePaginationMeta } from "./types/common";

// ============================================================================
// Types
// ============================================================================

/** Configuration options for the HTTP client. */
export interface HttpClientOptions {
  /** Base URL of the Nexus API (e.g. `"https://api.nexusgpt.io"`). */
  baseUrl: string;
  /** API key for authentication. */
  apiKey: string;
  /** Custom `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Additional headers sent with every request. */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in milliseconds (default 30 000). Applies to EACH attempt. */
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
   * Injectable sleep, so a test does not have to wait out the backoff. Defaults
   * to a real timer. Not part of the API surface a caller is expected to use.
   */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Methods a retry cannot add an effect to.
 *
 * This set is the whole safety argument for retrying at all, so it is
 * deliberately narrow. HTTP defines GET/HEAD/OPTIONS/PUT/DELETE as idempotent:
 * replaying one lands the caller in the same state as sending it once, whether
 * or not the first attempt reached the server.
 *
 * **POST and PATCH are absent on purpose and must stay absent.** A 502 from an
 * edge proxy cannot distinguish "no healthy upstream, the request was never
 * forwarded" from "the upstream applied it and the connection died before the
 * response came back". Replaying a POST on the second reading duplicates its
 * effect. `POST /emulator/:id/sessions/:id/messages` is the worked example: it
 * writes a message and starts an agent turn, so an automatic retry would post
 * the user's message twice and bill two model calls — strictly worse than
 * surfacing the error. A POST that needs to survive this needs an idempotency
 * key on the wire, which this API does not have.
 */
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
  "PUT",
  "DELETE"
]);

/**
 * Statuses that mean "the edge could not reach a healthy upstream right now".
 *
 * All three are produced by the proxy in front of the API rather than by the
 * application, which is why the body is typically HTML and never the v1 error
 * envelope. They are the signature of a rolling deploy: a request in flight on a
 * pod that is being replaced comes back as one of these, seconds into a call
 * that normally succeeds.
 *
 * 500 is NOT here. An application-level failure is deterministic often enough
 * that replaying it just triples the load, and it carries a real error body the
 * caller should see.
 */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/** Retries on top of the first attempt. Three attempts total. */
const DEFAULT_MAX_RETRIES = 2;

/** First backoff step; each subsequent retry doubles it. */
const DEFAULT_RETRY_BASE_DELAY_MS = 250;

/** Upper bound on a single backoff, so a large `maxRetries` cannot stall a CLI. */
const MAX_RETRY_DELAY_MS = 5_000;

/**
 * Full-jitter exponential backoff: a uniform draw from `[0, base * 2^n]`,
 * capped.
 *
 * Jittered rather than fixed because every client that failed did so for the
 * same reason at the same instant — a synchronised retry would hit the
 * recovering upstream as one wave. Drawing from zero spreads them out.
 *
 * @param attempt - 1 for the first retry, 2 for the second, and so on.
 * @param baseDelayMs - The first step.
 * @param random - Injectable source, so a test can pin the delay.
 */
export function retryDelayMs(
  attempt: number,
  baseDelayMs: number,
  random: () => number = Math.random
): number {
  const ceiling = Math.min(baseDelayMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
  return Math.floor(random() * ceiling);
}

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
    const code = typeof err.code === "string" ? err.code : `HTTP_${status}`;
    const message =
      typeof err.message === "string" ? err.message : `Request failed with status ${status}`;
    return status === 401
      ? new NexusAuthenticationError(message)
      : new NexusApiError(code, message, status, err.details);
  }

  const message =
    typeof envelope?.message === "string"
      ? envelope.message
      : `Request failed with status ${status}`;
  const code = typeof envelope?.error === "string" ? envelope.error : `HTTP_${status}`;

  return status === 401
    ? new NexusAuthenticationError(message)
    : new NexusApiError(code, message, status);
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
  private readonly apiKey: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
    this.defaultHeaders = opts.defaultHeaders ?? {};
    this.timeout = opts.timeout ?? 30_000;
    this.maxRetries = Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.retryBaseDelayMs = opts.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.sleep =
      opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Perform one attempt: fetch under the per-attempt timeout, mapping a
   * transport failure onto the SDK's own error types.
   */
  private async attempt(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new NexusTimeoutError(this.timeout);
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
   * Send a request, replaying a transient failure when — and only when — the
   * method is idempotent.
   *
   * Retryable in two ways, and both need to be here rather than at the call
   * sites: a proxy status ({@link RETRYABLE_STATUSES}), which arrives as an
   * ordinary `Response`, and a dropped connection, which arrives as a thrown
   * {@link NexusConnectionError}.
   *
   * A {@link NexusTimeoutError} is deliberately NOT retried even though it is a
   * subclass of the connection error. The caller stated a deadline; spending it
   * two more times over is not what they asked for, and unlike a 502 the server
   * may still be processing the request.
   *
   * A discarded 502 has its body cancelled before the next attempt. Node pins
   * the connection in the undici pool until a body is consumed or cancelled, so
   * dropping the response object on the floor leaks one socket per retry —
   * invisible to every gate, and worst under exactly the load that triggers a
   * retry in the first place.
   */
  private async send(method: string, url: string, init: RequestInit): Promise<Response> {
    const attempts = IDEMPOTENT_METHODS.has(method.toUpperCase()) ? this.maxRetries + 1 : 1;

    for (let n = 1; ; n++) {
      const isLast = n === attempts;
      try {
        const res = await this.attempt(url, init);
        if (isLast || !RETRYABLE_STATUSES.has(res.status)) return res;
        await res.body?.cancel().catch(() => undefined);
      } catch (err) {
        if (isLast || err instanceof NexusTimeoutError || !(err instanceof NexusConnectionError)) {
          throw err;
        }
      }
      await this.sleep(retryDelayMs(n, this.retryBaseDelayMs));
    }
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
      "api-key": this.apiKey
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

    const res = await this.send(method, url.toString(), fetchInit);

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
      throw toApiError(res.status, parsed);
    }

    return text;
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
      "api-key": this.apiKey,
      Accept: "application/json"
    };

    const fetchInit: RequestInit = { method, headers };

    if (opts.body !== undefined) {
      const serialized = serializeBody(opts.body, headers);
      if (serialized !== undefined) fetchInit.body = serialized;
    }

    const res = await this.send(method, url.toString(), fetchInit);

    // Handle 204 No Content (e.g. DELETE responses)
    if (res.status === 204) {
      return { data: {} as T, meta: undefined };
    }

    const rawBody = await readBody(res);

    // An empty body is not a parse failure. A 2xx that sends nothing succeeded
    // with nothing to report — POST /mcp answers a JSON-RPC *notification*
    // exactly that way: 201 with no body, by protocol.
    if (rawBody.trim() === "") {
      if (res.ok) return { data: {} as T, meta: undefined };
      throw toApiError(res.status, undefined);
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new NexusApiError(
        "PARSE_ERROR",
        `Failed to parse response body (status ${res.status})`,
        res.status
      );
    }

    // The HTTP STATUS decides success or failure — not the body's shape.
    //
    // This client used to key that decision off `json.success`, which made every
    // 2xx response that is not a v1 envelope look like an error: the body was
    // discarded and the caller got `Request failed with status 201`. That closed
    // off POST /mcp entirely (JSON-RPC 2.0 has its own response shape, and NestJS
    // answers a POST with 201), so `nexus api` could not reach the one endpoint
    // that has no typed command at all. See NEX-3021.
    if (res.ok) {
      if (isSuccessEnvelope<T>(json)) {
        return { data: json.data, meta: json.meta };
      }
      // An explicit `success: false` is the server declaring failure; honor it
      // even on a 2xx rather than handing a caller an error body as data.
      if (isRecord(json) && json.success === false) {
        throw toApiError(res.status, json);
      }
      // Any other 2xx body belongs to a route that speaks its own protocol.
      // Hand it back verbatim — that is what a passthrough owes its caller.
      return { data: json as T, meta: undefined };
    }

    throw toApiError(res.status, json);
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
