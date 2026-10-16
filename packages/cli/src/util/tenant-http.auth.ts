import { resolveBaseUrl, resolveOrganization, resolveProfile } from "../config";
import type { TenantHttpOptions, TenantQuery } from "./tenant-http.types";

/** The credential AND the tenant it acts on, from one resolution of the chain. */
export interface TenantAuth {
  apiKey: string;
  /** Absent when nothing selected an org — the key's own org decides, server-side. */
  organizationId?: string;
}

/**
 * Resolve the key and the acting organization together, the way
 * `createClient` does for every SDK-backed command.
 *
 * These are ONE resolution because the org rides on the profile the key came
 * from: resolving them separately is what let this transport send a key with no
 * `organization-id` beside it, so every `/api/vibe/...` route answered
 * `ORGANIZATION_REQUIRED` for a personal (`nxs_p_`) token that `nexus agent list`
 * accepted in the same shell.
 *
 * `opts.apiKey` is passed THROUGH rather than short-circuited: `resolveProfile`
 * returns on it at step 1 without loading config, so an explicit
 * `--api-key`/`NEXUS_API_KEY` override still costs no config file and still
 * cannot throw — and it reaches `resolveOrganization`, which reads
 * `NEXUS_ORGANIZATION_ID` first. That is the only way an override can name an
 * org at all, since `auth use-org` refuses to store one for it.
 *
 * Everything else is the shared profile chain (explicit --profile >
 * NEXUS_API_KEY env > active profile), so an explicit --profile is honored here
 * exactly as it is for base-URL resolution.
 */
export function resolveTenantAuth(opts: TenantHttpOptions): TenantAuth {
  const resolved = resolveProfile({
    apiKey: opts.apiKey,
    profile: opts.profile,
    baseUrl: opts.baseUrl
  });
  const { organizationId } = resolveOrganization(resolved.profile);
  return { apiKey: resolved.profile.apiKey, organizationId };
}

/**
 * The absolute URL this request goes to.
 *
 * One copy for all three verbs, so a trailing-slash rule or a query-coercion
 * rule cannot hold on one of them and not the others. `undefined` values are
 * DROPPED rather than sent as the string `"undefined"`, which is what
 * `append(key, String(value))` would do unguarded.
 */
export function tenantUrl(opts: TenantHttpOptions, path: string, query?: TenantQuery): URL {
  const baseUrl = resolveBaseUrl(opts.baseUrl, opts.profile).replace(/\/+$/, "");
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.append(key, String(value));
  }
  return url;
}

/**
 * The auth headers every verb sends, plus the `Accept` the verb decides.
 *
 * Spread conditionally, never `?? ""`. The guard's `extractOrganizationId`
 * requires `length > 0`, so a blank header refuses IDENTICALLY to an absent
 * one — the cost of `?? ""` is not a wrong refusal, it is a header that every
 * proxy log, trace and `curl -v` shows as a selection that was never made.
 * It is also the SDK client's own spelling, which is the point of mirroring.
 */
export function tenantHeaders(auth: TenantAuth, accept: string): Record<string, string> {
  return {
    "api-key": auth.apiKey,
    ...(auth.organizationId ? { "organization-id": auth.organizationId } : {}),
    Accept: accept
  };
}
