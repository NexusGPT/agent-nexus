import { NexusApiError } from "@agent-nexus/sdk";

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
export function toTenantApiError(
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
 * A non-2xx body as JSON, or `undefined` when it is empty or unparseable.
 *
 * The two binary-ish verbs read an error body this way and neither can afford
 * to throw while reporting a failure: a malformed error body must still arrive
 * as {@link toTenantApiError}'s last-resort message naming the request, never
 * as a `SyntaxError` from the reporting path.
 */
export function parseErrorBody(rawBody: string): unknown {
  if (rawBody.length === 0) return undefined;
  try {
    return JSON.parse(rawBody);
  } catch {
    return undefined;
  }
}
