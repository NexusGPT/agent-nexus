// ============================================================================
// Base error
// ============================================================================

/** Base error class for all Nexus SDK errors. */
export class NexusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NexusError";
  }
}

// ============================================================================
// API error — server returned { success: false }
// ============================================================================

/**
 * Thrown when the Nexus API returns an error response (`{ success: false }`).
 *
 * Check `status` for the HTTP status code and `code` for the machine-readable
 * error code (e.g. `"NOT_FOUND"`, `"VALIDATION_ERROR"`).
 */
export class NexusApiError extends NexusError {
  /** Machine-readable error code (e.g. `"NOT_FOUND"`, `"VALIDATION_ERROR"`). */
  public readonly code: string;
  /** HTTP status code (e.g. 400, 404, 500). */
  public readonly status: number;
  /** Additional error details (e.g. validation errors per field). */
  public readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "NexusApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ============================================================================
// Authentication error — 401
// ============================================================================

/**
 * Thrown when the API returns a 401.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A 401 IS NOT ONE CONDITION, AND `code` IS THE ONLY THING THAT SEPARATES THEM.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The code used to be hardcoded `"UNAUTHORIZED"` here, and `toApiError` computed
 * the real one and then discarded it on both 401 branches. So every 401 reached
 * every consumer identically, however specific the server had been.
 *
 * The server is specific. `AUTH_EXPIRED`, `AUTH_INVALID` and `REAUTH_REQUIRED`
 * all carry 401 and all describe a CONNECTED PROVIDER — a Google Drive,
 * SharePoint or Notion connection — not the caller's own API key. Flattened to
 * one code, a consumer can only give one answer, and the obvious answer
 * ("re-authenticate") is the wrong one for every provider case: it sends the
 * user to fix the credential that was never broken.
 *
 * `UNAUTHORIZED` remains the fallback when the server sends no code, matching
 * `HTTP_${status}` on the non-401 path — one default per path, stated once.
 *
 * @param message - Human-readable reason.
 * @param code - The server's error code. Defaults to `"UNAUTHORIZED"`, so the
 *   single-argument form every existing caller uses is unchanged.
 */
export class NexusAuthenticationError extends NexusApiError {
  constructor(message = "Invalid or missing API key", code = "UNAUTHORIZED") {
    super(code, message, 401);
    this.name = "NexusAuthenticationError";
  }
}

// ============================================================================
// Connection error — network/timeout failures
// ============================================================================

/** Thrown when the request fails due to network issues or timeout. */
export class NexusConnectionError extends NexusError {
  /** The underlying error that caused the connection failure. */
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "NexusConnectionError";
    this.cause = cause;
  }
}

// ============================================================================
// Timeout error — the client gave up waiting, not a network failure
// ============================================================================

/**
 * Thrown when the client-side timeout elapses before the API responds.
 *
 * Extends `NexusConnectionError` so existing catch-sites keep working, but
 * lets callers distinguish "we stopped waiting" (the server may still be
 * processing the request) from "the API was unreachable".
 */
export class NexusTimeoutError extends NexusConnectionError {
  /**
   * The client-side timeout that elapsed, in milliseconds.
   *
   * The EFFECTIVE one: a request may name its own deadline
   * (`RequestOptions.timeout`), in which case this is that value and not the
   * client's default.
   */
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "NexusTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}
