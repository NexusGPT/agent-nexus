import { NexusAuthenticationError, NexusTimeoutError } from "@agent-nexus/sdk";

import { resolveTenantAuth, tenantHeaders, tenantUrl } from "./tenant-http.auth";
import { parseErrorBody, toTenantApiError } from "./tenant-http.errors";
import { toTenantNetworkError } from "./tenant-http.network-errors";
import type { TenantDownload, TenantDownloadOptions, TenantHttpOptions } from "./tenant-http.types";

/**
 * GET a binary body from a tenant endpoint — a route whose contract declares
 * `responseType: "blob"` and therefore wears no `{ success, data }` envelope.
 *
 * `tenantRequest` cannot serve this: it decodes the body as text and demands
 * the envelope. This shares its auth, base-URL and timeout machinery and its
 * error shape, and differs only in keeping the success body as bytes. A
 * failure still arrives as the JSON error envelope, and is thrown through the
 * same `toTenantApiError` every other tenant command's message comes from.
 */
export async function tenantDownload(
  opts: TenantHttpOptions,
  req: TenantDownloadOptions
): Promise<TenantDownload> {
  const auth = resolveTenantAuth(opts);
  const url = tenantUrl(opts, req.path, req.query);

  const controller = new AbortController();
  const timeoutMs = opts.timeout ?? 120_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: tenantHeaders(auth, "application/octet-stream, application/json"),
        signal: controller.signal
      });
    } catch (err) {
      throw toTenantNetworkError(err, timeoutMs);
    }

    if (!response.ok) {
      if (response.status === 401) throw new NexusAuthenticationError();
      const parsed = parseErrorBody(await response.text());
      throw toTenantApiError(parsed, { method: "GET", path: req.path }, response.status);
    }

    return { bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers };
  } catch (err) {
    // The body reads above are inside the deadline too, so an abort while
    // draining bytes is the same timeout as an abort while connecting.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new NexusTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
