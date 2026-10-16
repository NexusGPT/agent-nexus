import type { AdminRequestOptions } from "./admin-http.types";

/**
 * Join the resolved base URL to the request path and append the query.
 *
 * `undefined` values are DROPPED rather than sent empty, so an omitted CLI flag
 * leaves the server's own default in force instead of overriding it with a
 * blank string — the contract `AdminRequestOptions.query` states, enforced in
 * the one place that builds the URL.
 */
export function buildAdminUrl(baseUrl: string, req: AdminRequestOptions): string {
  const parsedUrl = new URL(`${baseUrl}${req.path}`);
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (value === undefined) continue;
      parsedUrl.searchParams.append(key, String(value));
    }
  }
  return parsedUrl.toString();
}
