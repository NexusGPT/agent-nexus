import { type TenantHttpOptions, tenantRequest } from "../../../util/tenant-http";
import { type SetVisibilityResponse, type SingleVibeAppResponse } from "../../../vibe-wire-types";

/** What the write returned, plus the visibility the app carried before it. */
export interface VisibilityChange {
  priorVisibility: "PRIVATE" | "PUBLIC" | null;
  data: SetVisibilityResponse;
}

/** Read the current visibility, then write the requested one. */
export async function applyAppVisibility(
  opts: TenantHttpOptions,
  appId: string,
  target: "PRIVATE" | "PUBLIC"
): Promise<VisibilityChange> {
  // Read the CURRENT visibility before writing, purely so the output can
  // tell a real flip from a no-op. `SetVibeAppVisibilityUseCase` is
  // idempotent — re-asserting the visibility an app already has returns
  // without touching anything — and a delay notice printed over that
  // would describe a propagation that is not happening.
  //
  // Best-effort: a failed pre-read must not block the write the operator
  // actually asked for, so it degrades to `null` and the notice is simply
  // omitted rather than guessed.
  let priorVisibility: "PRIVATE" | "PUBLIC" | null = null;
  try {
    const before = await tenantRequest<SingleVibeAppResponse>(opts, {
      method: "GET",
      path: `/api/vibe/apps/${encodeURIComponent(appId)}`
    });
    priorVisibility = before.app.visibility;
  } catch {
    priorVisibility = null;
  }

  const data = await tenantRequest<SetVisibilityResponse>(opts, {
    method: "PATCH",
    path: `/api/vibe/apps/${encodeURIComponent(appId)}/visibility`,
    body: { visibility: target }
  });

  return { priorVisibility, data };
}
