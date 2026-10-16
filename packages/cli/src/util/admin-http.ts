import { resolveBaseUrl } from "../config";
import { AdminCliError } from "./admin-errors";
import { buildAdminUrl } from "./admin-http.build-url";
import { readAdminEnvelope } from "./admin-http.read-envelope";
import { resolveAdminToken } from "./admin-http.resolve-token";
import {
  ADMIN_REQUEST_DEFAULT_TIMEOUT_MS,
  type AdminHttpOptions,
  type AdminRequestOptions
} from "./admin-http.types";
import { fetchWithDeadline, RequestTimedOutError } from "./request-deadline";

/**
 * Admin HTTP client — separate from `@agent-nexus/sdk`.
 *
 * The SDK's HttpClient hardcodes the `/api/public/v1` prefix and authenticates
 * with the `api-key` header, which routes through `PublicApiKeyGuard` on the
 * backend. Admin endpoints live at `/api/admin/...` and are guarded by
 * `AdminPermissionGuard`, which reads the user identity off the Clerk JWT —
 * not the org API key. So admin commands need their own auth pipe.
 *
 * Token source: `--admin-token` global flag, then `NEXUS_ADMIN_TOKEN` env var —
 * `admin-http.resolve-token.ts`. The request and envelope shapes are
 * `admin-http.types.ts`; the response half is `admin-http.read-envelope.ts`.
 *
 * 🔴 WHAT IS LEFT HERE IS THE SEQUENCE, AND THAT IS THE POINT OF THE SPLIT.
 * Everything a reader needs in order to check that the deadline wraps the
 * request, that the write is announced BEFORE it is sent, and that a timeout
 * is classified apart from an unreachable host, is now in one screen — because
 * a step moved past the `await` is a behaviour change that passes every unit
 * test. The leaves are all synchronous and none of them can reorder it.
 *
 * Base URL resolution piggy-backs on the existing profile chain (--base-url
 * → NEXUS_BASE_URL → active profile's baseUrl → NEXUS_ENV; an unknown
 * `NEXUS_ENV` is REFUSED there rather than resolved to production). The
 * profile's API key is ignored — only the URL is borrowed. The request deadline
 * is the program-level `--timeout <seconds>` global, routed here by
 * `admin-opts.ts`; it bounds the body read as well as the headers.
 */

export type { AdminHttpOptions } from "./admin-http.types";

/**
 * Send a request against an `/api/admin/*` endpoint. Returns the unwrapped
 * `data` field. Throws `AdminCliError` for any non-2xx status — it carries the
 * HTTP status so the command can branch on it for exit codes.
 */
export async function adminRequest<T>(
  opts: AdminHttpOptions,
  req: AdminRequestOptions
): Promise<T> {
  const token = resolveAdminToken(opts);
  const baseUrl = resolveBaseUrl(opts.baseUrl, opts.profile).replace(/\/+$/, "");
  // 🔴 NAME THE HOST A WRITE REACHES, AND NAME IT ON STDERR. NEX-5919:
  // `NEXUS_ENV=staging` resolved to PRODUCTION, the write landed there, and the
  // run exited 0 with no host printed anywhere. Stdout would corrupt `--json`,
  // which is ONE document; announcing reads too would make the line ambient.
  if (req.method !== "GET") process.stderr.write(`admin ${req.method} → ${baseUrl}\n`);
  const url = buildAdminUrl(baseUrl, req);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // 🚨 A REQUEST WITH NO DEADLINE IS NOT A SLOW REQUEST, IT IS A HANG. A socket
  // that opens and never answers leaves `fetch` pending for ever: no output, no
  // error, no exit, nothing to retry. `--timeout` already parsed on every `nexus
  // admin …` — it reached nothing. `fetchWithDeadline` owns the body half.
  let response: Response;
  let rawBody: string;
  try {
    ({ response, text: rawBody } = await fetchWithDeadline(
      url,
      {
        method: req.method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body)
      },
      { timeout: opts.timeout ?? ADMIN_REQUEST_DEFAULT_TIMEOUT_MS }
    ));
  } catch (err) {
    // 🔴 A DEADLINE AND AN UNREACHABLE HOST ARE DIFFERENT CATEGORIES HERE, AND
    // BOTH USED TO LEAVE AS `network`. `AdminCliError.timedOut` owns why.
    //
    // The discrimination is only as good as the class: `fetchWithDeadline`
    // classifies on ITS OWN TIMER rather than on the shape of the transport's
    // teardown, so a peer destroying the socket as the budget expires still
    // arrives as `RequestTimedOutError` and not as a raw `TypeError` filed as
    // retryable.
    if (err instanceof RequestTimedOutError) throw AdminCliError.timedOut(err.message);
    throw AdminCliError.network(err instanceof Error ? err.message : String(err));
  }

  return readAdminEnvelope<T>(response, rawBody, url, req);
}
