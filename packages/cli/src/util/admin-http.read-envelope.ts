import { AdminCliError } from "./admin-errors";
import type { AdminRequestOptions, ApiErrorEnvelope, ApiSuccessEnvelope } from "./admin-http.types";

/**
 * Turn a finished response into the unwrapped `data`, or throw an
 * `AdminCliError` carrying the HTTP status.
 *
 * Entirely synchronous and entirely downstream of the single `await` in
 * `adminRequest` — which is why it is a leaf. The transport's ORDER is the
 * thing worth reading in one piece; what happens to a body already in hand is
 * not part of it, and a reader checking that the deadline wraps the request
 * should not have to scroll past three envelope branches to see it.
 */
export function readAdminEnvelope<T>(
  response: Response,
  rawBody: string,
  url: string,
  req: AdminRequestOptions
): T {
  let parsed: unknown;
  if (rawBody.length > 0) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // Non-JSON body (typically an HTML error page from a proxy). Surface
      // the status + a snippet so the operator can diagnose.
      throw AdminCliError.fromStatus(
        response.status,
        `Non-JSON response from ${url}: ${rawBody.slice(0, 200)}`
      );
    }
  }

  if (!response.ok) {
    const envelope = parsed as ApiErrorEnvelope | undefined;
    const message =
      envelope?.error?.message ?? `${req.method} ${req.path} failed with HTTP ${response.status}`;
    throw AdminCliError.fromStatus(response.status, message, envelope?.error?.code);
  }

  const envelope = parsed as ApiSuccessEnvelope<T> | undefined;
  if (!envelope || envelope.success !== true) {
    throw AdminCliError.fromStatus(response.status, `Malformed success envelope from ${url}`);
  }
  return envelope.data;
}
