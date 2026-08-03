/**
 * Admin HTTP client — separate from `@agent-nexus/sdk`.
 *
 * The SDK's HttpClient hardcodes the `/api/public/v1` prefix and authenticates
 * with the `api-key` header, which routes through `PublicApiKeyGuard` on the
 * backend. Admin endpoints live at `/api/admin/...` and are guarded by
 * `AdminPermissionGuard`, which reads the user identity off the Clerk JWT —
 * not the org API key. So admin commands need their own auth pipe.
 *
 * Token source: `--admin-token` global flag, then `NEXUS_ADMIN_TOKEN` env var.
 * Matches the precedent set by `apps/backend/src/tools/scripts/nuke-orgs.ts` —
 * the operator copies a Clerk JWT out of the browser session and passes it
 * here. CLI never persists the token (admin sessions are short-lived).
 *
 * Base URL resolution piggy-backs on the existing profile chain (--base-url
 * → NEXUS_BASE_URL → active profile's baseUrl → NEXUS_ENV → production). The
 * profile's API key is ignored — only the URL is borrowed.
 */

import { resolveBaseUrl } from "../config";
import { AdminCliError } from "./admin-errors";

export interface AdminHttpOptions {
  /** Override token (from `--admin-token`). Falls back to `NEXUS_ADMIN_TOKEN`. */
  adminToken?: string;
  /** Override base URL (from `--base-url`). Falls back to the profile chain. */
  baseUrl?: string;
  /** Override profile (used solely to find a baseUrl). */
  profile?: string;
}

interface AdminRequestOptions {
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

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ApiErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

/**
 * Send a request against an `/api/admin/*` endpoint. Returns the unwrapped
 * `data` field. Throws `AdminCliError` for any non-2xx status — the error
 * carries the HTTP status so the command can branch on it for exit codes.
 */
export async function adminRequest<T>(
  opts: AdminHttpOptions,
  req: AdminRequestOptions
): Promise<T> {
  const token = resolveAdminToken(opts);
  const baseUrl = resolveBaseUrl(opts.baseUrl, opts.profile).replace(/\/+$/, "");
  const parsedUrl = new URL(`${baseUrl}${req.path}`);
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (value === undefined) continue;
      parsedUrl.searchParams.append(key, String(value));
    }
  }
  const url = parsedUrl.toString();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body)
    });
  } catch (err) {
    throw AdminCliError.network(err instanceof Error ? err.message : String(err));
  }

  const rawBody = await response.text();
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

function resolveAdminToken(opts: AdminHttpOptions): string {
  const raw = opts.adminToken ?? process.env.NEXUS_ADMIN_TOKEN ?? "";
  const stripped = raw.replace(/^Bearer\s+/i, "").trim();
  if (!stripped) {
    throw AdminCliError.missingToken();
  }
  return stripped;
}
