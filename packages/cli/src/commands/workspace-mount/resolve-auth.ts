import { resolveBaseUrl, resolveProfile } from "../../config";
import type { MountScope } from "../../mount-registry";
import { printWarning } from "../../output";
import { actingScope } from "./acting-scope";

/** Resolve the API key + base URL + acting-org scope from the SDK's auth chain. */
export function resolveAuth(opts: { apiKey?: string; baseUrl?: string; profile?: string }): {
  apiKey: string;
  baseUrl: string;
  scope: MountScope;
} {
  const resolved = resolveProfile(opts);
  const apiKey = opts.apiKey ?? resolved.profile.apiKey;
  if (!apiKey) {
    throw new Error("No API key. Run `nexus auth login` or pass --api-key.");
  }
  // Through the canon. This was a hand-rolled copy that put `NEXUS_BASE_URL`
  // above a NAMED `--profile`, which `resolveBaseUrl` orders the other way —
  // and the host it produces is not merely where the request goes, it is the
  // `url:` bucket a mount is RECORDED under, so a disagreement here outlives
  // the command that caused it.
  const baseUrl = resolveBaseUrl(opts.baseUrl, opts.profile).replace(/\/$/, "");
  const scope = actingScope(resolved, baseUrl);
  if (!scope.orgId && !scope.profile) {
    // Raw --api-key/NEXUS_API_KEY with no org resolution: the acting org is
    // unknowable client-side. Record the mount in the base-URL fallback bucket
    // and say so loudly — `status` will show "?" and `unmount` matches by slug.
    printWarning(
      "Cannot determine the organization this mount will serve.",
      "The API key was passed directly (--api-key/NEXUS_API_KEY) and no NEXUS_ORGANIZATION_ID is set,",
      "so the mount is recorded without an org and scoped by base URL only.",
      "Prefer `nexus auth login` (or set NEXUS_ORGANIZATION_ID) so status/unmount can tell orgs apart."
    );
  }
  return { apiKey, baseUrl, scope };
}
