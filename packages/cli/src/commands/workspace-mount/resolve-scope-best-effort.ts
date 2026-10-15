import { resolveBaseUrl, resolveProfile } from "../../config";
import type { MountScope } from "../../mount-registry";
import { actingScope } from "./acting-scope";

/**
 * Resolve the acting-org scope for `unmount` without requiring auth. Unmount
 * operates purely on the local registry, so a user with no configured profile
 * must still be able to run it — resolution failures fall back to `undefined`,
 * and the registry lookup then matches by slug.
 *
 * A raw `--api-key`/`NEXUS_API_KEY` override with no NEXUS_ORGANIZATION_ID also
 * resolves to `undefined`: it carries no org or profile identity (only a base
 * URL), so scoping the lookup by it would hide a row written under a real
 * org/profile key. Treating it as an unknown scope lets `findMount` fall back
 * to a slug match instead.
 *
 * That fallback is deliberately NARROW, because `undefined` here is also what a
 * typo'd `--profile` produces (the profile lookup throws and the `catch` below
 * swallows it, error and all). `findMount` will hand back a unique slug match
 * only when the record names NO org or profile; anything owned makes the caller
 * list the candidates and ask the user to name one. Otherwise a mistyped flag
 * would silently OS-detach and delete another org's mount.
 */
export function resolveScopeBestEffort(opts: {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
}): MountScope | undefined {
  try {
    const resolved = resolveProfile(opts);
    // Through the canon — see `workspace-mount/resolve-auth.ts`.
    // This copy has to agree with that one exactly or `findMount` looks in a
    // different `url:` bucket than the mount was recorded under.
    const baseUrl = resolveBaseUrl(opts.baseUrl, opts.profile).replace(/\/$/, "");
    const scope = actingScope(resolved, baseUrl);
    if (!scope.orgId && !scope.profile) return undefined;
    return scope;
  } catch {
    return undefined;
  }
}
