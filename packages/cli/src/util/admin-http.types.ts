/**
 * The shapes `adminRequest` takes and the envelopes it unwraps.
 *
 * A leaf with no imports, so the transport in `admin-http.ts` is the request
 * SEQUENCE and nothing else — the part where a reordered `await` is a
 * behaviour change no unit test necessarily catches.
 */

/**
 * The deadline when `--timeout` is not given. MILLISECONDS, and the same figure
 * `tenant-http.ts` uses — same backend, same link, so one number to remember
 * rather than two. A DEFAULT, never a ceiling: the global moves it.
 */
export const ADMIN_REQUEST_DEFAULT_TIMEOUT_MS = 30_000;

export interface AdminHttpOptions {
  /** Override token (from `--admin-token`). Falls back to `NEXUS_ADMIN_TOKEN`. */
  adminToken?: string;
  /** Override base URL (from `--base-url`). Falls back to the profile chain. */
  baseUrl?: string;
  /** Override profile (used solely to find a baseUrl). */
  profile?: string;
  /** Request timeout in ms (default 30_000). Carries the global `--timeout`. */
  timeout?: number;
}

export interface AdminRequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  /**
   * Query string parameters. `undefined` values are DROPPED rather than sent
   * empty, so an omitted CLI flag leaves the server's own default in force
   * instead of overriding it with a blank string. Booleans + numbers coerce
   * to string. Same contract as `tenant-http.ts`, which mirrors this file.
   */
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}
