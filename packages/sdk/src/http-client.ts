import { NexusApiError, NexusAuthenticationError, NexusConnectionError } from "./errors";
import type { PaginationMeta } from "./types/common";

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
  /** Request timeout in milliseconds (default 30 000). */
  timeout?: number;
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
  meta?: PaginationMeta;
}

interface ApiErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
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
 * in the `api-key` header. Responses are expected to follow the envelope format:
 * `{ success: true, data: T, meta?: PaginationMeta }`.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeout: number;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
    this.defaultHeaders = opts.defaultHeaders ?? {};
    this.timeout = opts.timeout ?? 30_000;
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await this.fetchFn(url.toString(), { method, headers, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new NexusConnectionError(`Request timed out after ${this.timeout}ms`);
      }
      throw new NexusConnectionError(
        err instanceof Error ? err.message : "Network request failed",
        err instanceof Error ? err : undefined
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      if (res.status === 401) throw new NexusAuthenticationError();
      throw new NexusApiError("HTTP_ERROR", `Request failed with status ${res.status}`, res.status);
    }

    return res.text();
  }

  /**
   * Make a request and return `{ data, meta }` (useful for paginated lists).
   *
   * @param method - HTTP method.
   * @param path - API path relative to `/api/public/v1`.
   * @param opts - Optional body, query params, and headers.
   * @returns The response `data` and optional pagination `meta`.
   * @throws {NexusAuthenticationError} On 401 responses.
   * @throws {NexusApiError} On other error responses.
   * @throws {NexusConnectionError} On network failures or timeouts.
   */
  async requestWithMeta<T>(
    method: string,
    path: string,
    opts: RequestOptions = {}
  ): Promise<{ data: T; meta?: PaginationMeta }> {
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
      if (opts.body instanceof FormData) {
        fetchInit.body = opts.body;
        // Let the browser/runtime set Content-Type with boundary for FormData
      } else {
        headers["Content-Type"] = "application/json";
        fetchInit.body = JSON.stringify(opts.body);
      }
    }

    // Timeout via AbortController
    const controller = new AbortController();
    fetchInit.signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await this.fetchFn(url.toString(), fetchInit);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new NexusConnectionError(`Request timed out after ${this.timeout}ms`);
      }
      throw new NexusConnectionError(
        err instanceof Error ? err.message : "Network request failed",
        err instanceof Error ? err : undefined
      );
    } finally {
      clearTimeout(timer);
    }

    // Handle 204 No Content (e.g. DELETE responses)
    if (res.status === 204) {
      return { data: {} as T, meta: undefined };
    }

    // Parse JSON
    let json: ApiSuccessEnvelope<T> | ApiErrorEnvelope;
    try {
      json = (await res.json()) as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
    } catch {
      throw new NexusApiError(
        "PARSE_ERROR",
        `Failed to parse response body (status ${res.status})`,
        res.status
      );
    }

    // Handle error envelope
    if (!json.success) {
      const err = (json as ApiErrorEnvelope).error;
      if (!err || typeof err !== "object") {
        // Non-envelope error response (e.g. NestJS default 404/500)
        const raw = json as unknown as Record<string, unknown>;
        const msg = (raw.message as string) ?? `Request failed with status ${res.status}`;
        const code = (raw.error as string) ?? `HTTP_${res.status}`;
        if (res.status === 401) {
          throw new NexusAuthenticationError(msg);
        }
        throw new NexusApiError(code, msg, res.status);
      }
      if (res.status === 401) {
        throw new NexusAuthenticationError(err.message);
      }
      throw new NexusApiError(err.code, err.message, res.status, err.details);
    }

    const success = json as ApiSuccessEnvelope<T>;
    return { data: success.data, meta: success.meta };
  }
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
