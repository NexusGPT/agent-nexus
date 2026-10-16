import { NexusApiError, NexusAuthenticationError } from "@agent-nexus/sdk";

import { resolveTenantAuth, tenantHeaders, tenantUrl } from "./tenant-http.auth";
import { toTenantApiError } from "./tenant-http.errors";
import { toTenantNetworkError } from "./tenant-http.network-errors";
import type {
  ApiSuccessEnvelope,
  TenantHttpOptions,
  TenantRequestOptions
} from "./tenant-http.types";

/**
 * The response body, decoded and unwrapped.
 *
 * A non-JSON body is a hard refusal here and NOT the tolerant
 * `parseErrorBody` the binary verbs use: this route's whole contract is the
 * `{ success, data }` envelope, so a body that is not JSON has already broken
 * it and saying so names the real fault. The first 200 characters go into the
 * message because an HTML error page's opening tag is what identifies a proxy
 * answering in the backend's place.
 */
async function unwrapEnvelope<T>(
  response: Response,
  req: Pick<TenantRequestOptions, "method" | "path">
): Promise<T> {
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
  const auth = resolveTenantAuth(opts);
  const url = tenantUrl(opts, req.path, req.query);

  const headers = tenantHeaders(auth, "application/json");
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
    throw toTenantNetworkError(err, timeoutMs);
  } finally {
    clearTimeout(timer);
  }

  return unwrapEnvelope<T>(response, req);
}
