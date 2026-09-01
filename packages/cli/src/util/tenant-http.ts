/**
 * Tenant HTTP client for Nexus-internal endpoints that live OUTSIDE the
 * SDK's `/api/public/v1` surface.
 *
 * Why this exists, given that `@agent-nexus/sdk` already authenticates
 * org-scoped tenant calls with `api-key`:
 *
 *   - `HttpClient` hardcodes the path prefix `/api/public/v1` (see
 *     `packages/sdk/src/http-client.ts`). Vibe endpoints are mounted
 *     at `/api/vibe/...` directly off the backend root — they go
 *     through `CompositeAuthGuard` + `FeatureFlagGuard`, not the
 *     `PublicApiKeyGuard` pipeline.
 *
 *   - Extending the SDK to take an arbitrary path would force a new
 *     SDK release for every Vibe CLI surface we add; the auth shape
 *     and envelope are identical, only the prefix changes.
 *
 * Mirror `admin-http.ts` structurally so the two transports stay
 * recognisable side-by-side. The two differ ONLY in:
 *
 *   - the auth header (`api-key` here, `Authorization: Bearer` there)
 *   - the token source (profile chain here, --admin-token / env there)
 *   - the tenant selector: this transport sends `organization-id`
 *     alongside the key, resolved by the same `resolveOrganization`
 *     the SDK client uses. A platform-operator token names no
 *     organization, so `admin-http.ts` sends no such header.
 *   - exit-code mapping is the SDK's `handleError` instead of the
 *     admin tree's `handleAdminError`
 *
 * Path is passed in absolute (e.g. `/api/vibe/audit-events`) — the
 * caller knows the surface it's hitting and prefix collision against
 * a future `/api/public/v1/vibe/...` would otherwise be silent.
 */

import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError
} from "@agent-nexus/sdk";

import { resolveBaseUrl, resolveOrganization, resolveProfile } from "../config";

export interface TenantHttpOptions {
  /** Override API key (from `--api-key` global). Falls back to the profile chain. */
  apiKey?: string;
  /** Override base URL (from `--base-url` global). Falls back to the profile chain. */
  baseUrl?: string;
  /** Override profile name (from `--profile` global). */
  profile?: string;
  /** Request timeout in ms (default 30_000). Surfaced for parity with the SDK. */
  timeout?: number;
}

interface TenantRequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Absolute path on the backend, e.g. `/api/vibe/audit-events`. Must start with `/`. */
  path: string;
  /** Query string parameters. `undefined` values are dropped. Booleans + numbers coerce to string. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Body to JSON-serialize. `undefined` skips the body. */
  body?: unknown;
}

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

/**
 * A handler that names its own failure: `{ code, message }` at the TOP level.
 *
 * This is the shape the endpoints reached through THIS client send, in every
 * environment. The backend's envelope rewrapper (`HttpExceptionFilter`) is
 * scoped to `/api/public/v1`, and everything here is deliberately outside that
 * prefix, so Nest replies with the exception's payload verbatim.
 *
 * CORRECTION (NEX-2993). This comment used to say the shape "depends on the
 * ENVIRONMENT, not on the handler" — bare against staging/prod, enveloped with
 * the code flattened to `HTTP_409` against a local backend — because the whole
 * filter stack was registered only `if (SENTRY_DSN)`. That split was real and is
 * now gone: the rewrapper is registered unconditionally and scoped by path, so a
 * code-keyed behaviour that works against prod works against a local backend too.
 *
 * The envelope reader below is still correct and still first: `/api/public/v1`
 * responses (reached through the SDK's `HttpClient`, not this file) wear it, and
 * a handler here is free to build one itself.
 */
interface NamedApiError {
  code: string;
  message: string;
  details?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The `{ success: false, error: { … } }` envelope. `code` is tolerated as
 * absent — the message is the part a caller cannot do without, and reading the
 * two together would drop a perfectly good message over a missing code.
 */
function asErrorEnvelope(parsed: unknown): NamedApiError | null {
  if (!isRecord(parsed) || !isRecord(parsed.error)) return null;
  const { code, message, details } = parsed.error;
  if (typeof message !== "string") return null;
  return { code: typeof code === "string" ? code : "HTTP_ERROR", message, details };
}

/** The bare `{ code, message }` a handler throws to name its own failure. */
function asNamedError(parsed: unknown): NamedApiError | null {
  if (!isRecord(parsed)) return null;
  const { code, message, details } = parsed;
  return typeof code === "string" && typeof message === "string"
    ? { code, message, details }
    : null;
}

/**
 * Nest's own default — `{ statusCode, error: "Forbidden", message }` — where
 * `error` is a generic label, not a code. A guard rejection on these routes
 * lands here. There is no code to offer, but the message still says more than
 * the request's name does.
 */
function asMessageOnlyError(parsed: unknown): NamedApiError | null {
  if (!isRecord(parsed) || typeof parsed.message !== "string") return null;
  return { code: "HTTP_ERROR", message: parsed.message };
}

/**
 * Turn a non-2xx body into a typed error, reading every shape the backend
 * actually sends.
 *
 * Only the envelope was read before, so a handler that named its own condition
 * lost both halves of what it said: the code became "HTTP_ERROR" and the
 * message became "POST /path failed with HTTP 409". The reason a caller was
 * owed — "your organization has no dedicated Vibe cluster …" — never reached
 * the terminal, and `err.code` could not be branched on, so a surface could
 * offer no next step for a condition the API had gone to the trouble of naming.
 *
 * Ordered most-specific first. A `{ code, message }` also has a message, so it
 * must be read before the message-only shape or its code would be thrown away
 * again. Naming the request is the last resort, so an empty or unrecognised
 * body is still legible rather than an empty string.
 */
function toTenantApiError(
  parsed: unknown,
  req: { method: string; path: string },
  status: number
): NexusApiError {
  const named = asErrorEnvelope(parsed) ?? asNamedError(parsed) ?? asMessageOnlyError(parsed);
  return named === null
    ? new NexusApiError(
        "HTTP_ERROR",
        `${req.method} ${req.path} failed with HTTP ${status}`,
        status
      )
    : new NexusApiError(named.code, named.message, status, named.details);
}

/**
 * Send a request against a tenant endpoint outside `/api/public/v1`.
 * Returns the unwrapped `data` field. Throws SDK error classes on
 * non-2xx + network failures so `handleError(err)` in `errors.ts`
 * formats the message identically to every other tenant CLI command.
 */
export async function tenantRequest<T>(
  opts: TenantHttpOptions,
  req: TenantRequestOptions
): Promise<T> {
  const { apiKey, organizationId } = resolveTenantAuth(opts);
  const baseUrl = resolveBaseUrl(opts.baseUrl, opts.profile).replace(/\/+$/, "");
  const url = new URL(`${baseUrl}${req.path}`);
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (value === undefined) continue;
      url.searchParams.append(key, String(value));
    }
  }

  // Spread conditionally, never `?? ""`. The guard's `extractOrganizationId`
  // requires `length > 0`, so a blank header refuses IDENTICALLY to an absent
  // one — the cost of `?? ""` is not a wrong refusal, it is a header that every
  // proxy log, trace and `curl -v` shows as a selection that was never made.
  // It is also the SDK client's own spelling, which is the point of mirroring.
  const headers: Record<string, string> = {
    "api-key": apiKey,
    ...(organizationId ? { "organization-id": organizationId } : {}),
    Accept: "application/json"
  };
  if (req.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeout ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: controller.signal
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new NexusTimeoutError(timeoutMs);
    }
    throw new NexusConnectionError(
      err instanceof Error ? err.message : "Network request failed",
      err instanceof Error ? err : undefined
    );
  } finally {
    clearTimeout(timer);
  }

  const rawBody = await response.text();
  let parsed: unknown;
  if (rawBody.length > 0) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new NexusApiError(
        "INVALID_RESPONSE",
        `Non-JSON response from ${req.method} ${req.path}: ${rawBody.slice(0, 200)}`,
        response.status
      );
    }
  }

  if (!response.ok) {
    if (response.status === 401) throw new NexusAuthenticationError();
    throw toTenantApiError(parsed, req, response.status);
  }

  const envelope = parsed as ApiSuccessEnvelope<T> | undefined;
  if (!envelope || envelope.success !== true) {
    throw new NexusApiError(
      "INVALID_RESPONSE",
      `Malformed success envelope from ${req.method} ${req.path}`,
      response.status
    );
  }
  return envelope.data;
}

export interface TenantStreamOptions {
  /** Absolute path on the backend, e.g. `/api/vibe/apps/<id>/logs/stream`. */
  path: string;
  /** Query string parameters. `undefined` values are dropped. */
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Aborts the connection AND the response body. This is how Ctrl-C reaches the
   * socket: without it a caller can stop reading and still leave the request
   * open until the server's own cap fires.
   */
  signal: AbortSignal;
  /**
   * How long to wait for response HEADERS. It never bounds the stream itself —
   * a follow is expected to stay open for minutes and a quiet app must not look
   * like a broken one, which is exactly what `tenantRequest`'s whole-request
   * timeout would do here.
   */
  connectTimeoutMs?: number;
}

/**
 * Open a streaming response against a tenant endpoint and yield its text as it
 * arrives.
 *
 * `tenantRequest` cannot serve this: it `await`s the whole body and then demands
 * a `{ success, data }` envelope. The SSE routes are deliberately outside the
 * generated surface and carry no envelope at all — see
 * `vibe-app-log-stream.controller.ts`, which explains why a stream cannot wear
 * one. So this shares the transport's auth, base-URL and error-shape machinery
 * and differs in exactly the two ways it must: it never buffers, and it never
 * interprets the body.
 *
 * FAILURE BEFORE THE FIRST BYTE is a normal HTTP error and is thrown as one, via
 * the same `toTenantApiError` every other tenant command's message comes from.
 * That is the half that matters for a 404: a foreign `appId` and an id that
 * never existed arrive here as the identical response, and nothing in this
 * function can or should tell them apart.
 */
export async function tenantStream(
  opts: TenantHttpOptions,
  req: TenantStreamOptions
): Promise<AsyncIterable<string>> {
  const { apiKey, organizationId } = resolveTenantAuth(opts);
  const baseUrl = resolveBaseUrl(opts.baseUrl, opts.profile).replace(/\/+$/, "");
  const url = new URL(`${baseUrl}${req.path}`);
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (value === undefined) continue;
      url.searchParams.append(key, String(value));
    }
  }

  // One controller drives the fetch, fed by two sources: the caller's signal
  // (Ctrl-C) and the connect timer. `AbortSignal.any` would say this in one
  // line and is Node 20.3+; this package declares `node >= 18`.
  const controller = new AbortController();
  const forwardAbort = (): void => {
    controller.abort();
  };
  if (req.signal.aborted) controller.abort();
  else req.signal.addEventListener("abort", forwardAbort, { once: true });

  const connectTimeoutMs = req.connectTimeoutMs ?? 30_000;
  let connectTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    controller.abort();
  }, connectTimeoutMs);
  const clearConnectTimer = (): void => {
    if (connectTimer !== undefined) {
      clearTimeout(connectTimer);
      connectTimer = undefined;
    }
  };
  const release = (): void => {
    clearConnectTimer();
    req.signal.removeEventListener("abort", forwardAbort);
  };

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "api-key": apiKey,
        ...(organizationId ? { "organization-id": organizationId } : {}),
        Accept: "text/event-stream"
      },
      signal: controller.signal
    });
  } catch (err) {
    release();
    // The caller aborting is not a failure — it is what Ctrl-C does, and it must
    // reach the follow driver as an abort rather than as a connection error.
    if (req.signal.aborted) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new NexusTimeoutError(connectTimeoutMs);
    }
    throw new NexusConnectionError(
      err instanceof Error ? err.message : "Network request failed",
      err instanceof Error ? err : undefined
    );
  }

  // Headers are in. From here the stream governs its own lifetime.
  clearConnectTimer();

  if (!response.ok) {
    const rawBody = await response.text();
    release();
    if (response.status === 401) throw new NexusAuthenticationError();
    let parsed: unknown;
    if (rawBody.length > 0) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = undefined;
      }
    }
    throw toTenantApiError(parsed, { method: "GET", path: req.path }, response.status);
  }

  if (response.body === null) {
    release();
    throw new NexusApiError(
      "INVALID_RESPONSE",
      `GET ${req.path} returned no response body to stream`,
      response.status
    );
  }

  return readTextChunks(response.body, release);
}

/**
 * The response body as decoded text, chunk by chunk.
 *
 * `getReader()` rather than `for await (… of body)` so the cancel in `finally`
 * is explicit: a caller that stops iterating — a `break`, a throw, an abort —
 * must not leave the socket held. `reader.cancel()` returns a promise, and its
 * rejection is caught rather than floated: the socket is frequently already gone
 * by the time this runs, and an unhandled rejection terminates Node.
 */
async function* readTextChunks(
  body: ReadableStream<Uint8Array>,
  onDone: () => void
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) yield decoder.decode(value, { stream: true });
    }
    // Flush whatever a multi-byte character left straddling the last chunk.
    const tail = decoder.decode();
    if (tail.length > 0) yield tail;
  } finally {
    reader.cancel().catch(() => undefined);
    onDone();
  }
}

/** The credential AND the tenant it acts on, from one resolution of the chain. */
interface TenantAuth {
  apiKey: string;
  /** Absent when nothing selected an org — the key's own org decides, server-side. */
  organizationId?: string;
}

/**
 * Resolve the key and the acting organization together, the way
 * `createClient` does for every SDK-backed command.
 *
 * These are ONE resolution because the org rides on the profile the key came
 * from: resolving them separately is what let this transport send a key with no
 * `organization-id` beside it, so every `/api/vibe/...` route answered
 * `ORGANIZATION_REQUIRED` for a personal (`nxs_p_`) token that `nexus agent list`
 * accepted in the same shell.
 *
 * `opts.apiKey` is passed THROUGH rather than short-circuited: `resolveProfile`
 * returns on it at step 1 without loading config, so an explicit
 * `--api-key`/`NEXUS_API_KEY` override still costs no config file and still
 * cannot throw — and it reaches `resolveOrganization`, which reads
 * `NEXUS_ORGANIZATION_ID` first. That is the only way an override can name an
 * org at all, since `auth use-org` refuses to store one for it.
 *
 * Everything else is the shared profile chain (explicit --profile >
 * NEXUS_API_KEY env > active profile), so an explicit --profile is honored here
 * exactly as it is for base-URL resolution.
 */
function resolveTenantAuth(opts: TenantHttpOptions): TenantAuth {
  const resolved = resolveProfile({
    apiKey: opts.apiKey,
    profile: opts.profile,
    baseUrl: opts.baseUrl
  });
  const { organizationId } = resolveOrganization(resolved.profile);
  return { apiKey: resolved.profile.apiKey, organizationId };
}
