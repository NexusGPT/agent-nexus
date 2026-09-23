import { type ResolvedProfile, resolveOrganization } from "../../config";
import type { MountScope } from "../../mount-registry";

/**
 * The acting org for a resolved credential — the org the server will serve for
 * it. Resolved through `resolveOrganization`, the SAME function `createClient`,
 * `mcp-rpc` and `tenant-http` send the `organization-id` header from, so a mount
 * cannot be recorded against one organization while the API calls that fill it
 * go to another (NEX-2474). Post NEX-3175 a mismatched override 403s
 * server-side instead of silently answering from another org, so this
 * resolution is deterministic at mount time; the registry pins it and `auth
 * use-org` switches later never retarget an existing mount.
 *
 * This used to re-implement the precedence by hand as the env var falling back
 * to the profile's `orgId` (NEX-4621). It agreed with the canon at the time,
 * which is exactly why nothing would have reported the day it stopped: a second
 * copy of a selection rule does not fail, it picks a different tenant.
 *
 * The org NAME is only known when the acting org is the profile's own org; an
 * env override naming a different org yields an id but no name. That test stays
 * a comparison of VALUES rather than a read of `source`, because an env
 * override naming the profile's own org is still the profile's org and its name
 * is still known.
 */
export function actingScope(resolved: ResolvedProfile, baseUrl: string): MountScope {
  const profileOrgId = resolved.profile.orgId;
  const { organizationId: orgId } = resolveOrganization(resolved.profile);
  return {
    profile: resolved.source === "override" ? undefined : resolved.name,
    orgId,
    orgName: orgId && orgId === profileOrgId ? resolved.profile.orgName : undefined,
    baseUrl
  };
}
