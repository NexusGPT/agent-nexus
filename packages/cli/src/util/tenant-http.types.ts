/**
 * The shapes the tenant transport is called with and answers in.
 *
 * Declared in a leaf of their own so every other module in this transport —
 * the auth resolution, the URL builder, the error reader and the three verbs —
 * imports them from ONE place. A type re-declared beside its user is a copy,
 * and a copy drifts.
 */

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

/** Query string parameters. `undefined` values are dropped. Booleans + numbers coerce to string. */
export type TenantQuery = Record<string, string | number | boolean | undefined>;

export interface TenantRequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Absolute path on the backend, e.g. `/api/vibe/audit-events`. Must start with `/`. */
  path: string;
  query?: TenantQuery;
  /** Body to JSON-serialize. `undefined` skips the body. */
  body?: unknown;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface TenantDownloadOptions {
  /** Absolute path on the backend, e.g. `/api/vibe/app-starter`. */
  path: string;
  query?: TenantQuery;
}

export interface TenantDownload {
  bytes: Buffer;
  headers: Headers;
}

export interface TenantStreamOptions {
  /** Absolute path on the backend, e.g. `/api/vibe/apps/<id>/logs/stream`. */
  path: string;
  query?: TenantQuery;
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
