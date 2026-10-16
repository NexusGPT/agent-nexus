/**
 * Tenant HTTP client for Nexus-internal endpoints that live OUTSIDE the
 * SDK's `/api/public/v1` surface.
 *
 * Why this exists, given that `@agent-nexus/sdk` already authenticates
 * org-scoped tenant calls with `api-key`:
 *
 *   - `HttpClient` hardcodes the path prefix `/api/public/v1` (see
 *     `packages/sdk/src/http-client.ts`). Vibe endpoints are mounted
 *     at `/api/vibe/...` directly off the backend root — they go
 *     through `CompositeAuthGuard` + `FeatureFlagGuard`, not the
 *     `PublicApiKeyGuard` pipeline.
 *
 *   - Extending the SDK to take an arbitrary path would force a new
 *     SDK release for every Vibe CLI surface we add; the auth shape
 *     and envelope are identical, only the prefix changes.
 *
 * Mirror `admin-http.ts` structurally so the two transports stay
 * recognisable side-by-side. The two differ ONLY in:
 *
 *   - the auth header (`api-key` here, `Authorization: Bearer` there)
 *   - the token source (profile chain here, --admin-token / env there)
 *   - the tenant selector: this transport sends `organization-id`
 *     alongside the key, resolved by the same `resolveOrganization`
 *     the SDK client uses. A platform-operator token names no
 *     organization, so `admin-http.ts` sends no such header.
 *   - exit-code mapping is the SDK's `handleError` instead of the
 *     admin tree's `handleAdminError`
 *
 * Path is passed in absolute (e.g. `/api/vibe/audit-events`) — the
 * caller knows the surface it's hitting and prefix collision against
 * a future `/api/public/v1/vibe/...` would otherwise be silent.
 *
 * ── WHERE EACH PART LIVES ────────────────────────────────────────────────────
 *
 * This file is the entry point and declares nothing of its own, so every
 * importer — and every `vi.mock("…/util/tenant-http")` already in this package
 * — keeps one module path while each concern stays its own file:
 *
 *   `.types.ts`           the option and result shapes every other part reads
 *   `.auth.ts`            key + acting org in ONE resolution, the URL, the headers
 *   `.errors.ts`          every non-2xx body shape the backend actually sends
 *   `.network-errors.ts`  what a dead socket or a blown deadline means
 *   `.request.ts`         the JSON verb, and the `{ success, data }` envelope
 *   `.download.ts`        the binary verb
 *   `.stream.ts`          the SSE verb and its connect-deadline guard
 *   `.stream-body.ts`     the body reader, and why the socket is cancelled
 */

export { tenantDownload } from "./tenant-http.download";
export { tenantRequest } from "./tenant-http.request";
export { tenantStream } from "./tenant-http.stream";
export type {
  TenantDownload,
  TenantDownloadOptions,
  TenantHttpOptions,
  TenantStreamOptions
} from "./tenant-http.types";
