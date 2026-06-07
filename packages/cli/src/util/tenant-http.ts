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
 *   - exit-code mapping is the SDK's `handleError` instead of the
 *     admin tree's `handleAdminError`
 *
 * Path is passed in absolute (e.g. `/api/vibe/audit-events`) — the
 * caller knows the surface it's hitting and prefix collision against
 * a future `/api/public/v1/vibe/...` would otherwise be silent.
 */

import { NexusApiError, NexusAuthenticationError, NexusConnectionError } from "@agent-nexus/sdk";

import { resolveBaseUrl, resolveProfile } from "../config";

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

interface ApiErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
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
  const apiKey = resolveTenantApiKey(opts);
  const baseUrl = resolveBaseUrl(opts.baseUrl, opts.profile).replace(/\/+$/, "");
  const url = new URL(`${baseUrl}${req.path}`);
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (value === undefined) continue;
      url.searchParams.append(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    "api-key": apiKey,
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
      throw new NexusConnectionError(`Request timed out after ${timeoutMs}ms`);
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
    const envelope = parsed as ApiErrorEnvelope | undefined;
    const message =
      envelope?.error?.message ?? `${req.method} ${req.path} failed with HTTP ${response.status}`;
    throw new NexusApiError(
      envelope?.error?.code ?? "HTTP_ERROR",
      message,
      response.status,
      envelope?.error?.details
    );
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

function resolveTenantApiKey(opts: TenantHttpOptions): string {
  if (opts.apiKey) return opts.apiKey;
  // Defer to the shared profile chain (explicit --profile > NEXUS_API_KEY env >
  // active profile) so an explicit --profile is honored here too, exactly as it
  // is for base-URL resolution — resolveProfile applies NEXUS_API_KEY at the
  // correct precedence, so no separate env short-circuit is needed.
  return resolveProfile({ profile: opts.profile, baseUrl: opts.baseUrl }).profile.apiKey;
}
