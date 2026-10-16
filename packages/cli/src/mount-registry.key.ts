import type { MountScope } from "./mount-registry.model";

/**
 * THE REGISTRY KEY: `<kind>:<id>|<slug>`.
 *
 * The `<kind>:` tag is load-bearing, not decoration. Profile names are
 * `^[a-z0-9][a-z0-9_-]{0,31}$` (config-profile-name.ts), which an org id like `org_a1b2c3`
 * satisfies — so an UNTAGGED `<id>|<slug>` key space lets a profile named after
 * an org id generate that org's exact registry key. `findMount` would then hand
 * another org's live row to `unmount` (detaching its drive and deleting its row),
 * the mount guard would refuse on its behalf, and a fresh mount would overwrite
 * it. Tagging by kind makes the two spaces disjoint at the string level: an
 * `org:` key can never equal a `profile:` or `url:` key.
 *
 * That disjointness is BETWEEN tags, and only between tags. WITHIN the `url:`
 * tag there is exactly one bucket per (base URL, slug) — every org that mounts
 * anonymously (raw `--api-key`/`NEXUS_API_KEY` with no `NEXUS_ORGANIZATION_ID`)
 * on a given host shares it, because nothing client-side can tell those callers
 * apart. Two orgs mounting the same slug that way collide: the second is refused
 * by the live-mount guard rather than silently overwriting the first, and the
 * refusal says so. It is a block, not data loss — but it is a real cross-org
 * interaction, so do not read the tag argument as covering it.
 *
 * `|` separates the scope id from the slug, so an id may never contain one. Org
 * ids and profile names cannot (both are alphanumeric plus `-`/`_`), but the
 * `url:` id is `--base-url`/`NEXUS_BASE_URL`/profile config with only a trailing
 * slash stripped — user input, not a validated shape. `scopeIdOfKind` therefore
 * ENFORCES the invariant by percent-encoding `|` rather than asserting it holds.
 *
 * The acting org is resolved exactly the way `createClient` resolves it for API
 * calls — `NEXUS_ORGANIZATION_ID` override first, then the profile's selected
 * org (NEX-2474) — so what the registry records is what the server will serve:
 * post NEX-3175 a mismatched organization-id header 403s instead of silently
 * answering from another org, making the resolution deterministic at mount time.
 * Switching orgs later (`nexus auth use-org`) does NOT retarget existing mounts;
 * they stay pinned to the org recorded when they were created.
 */

/** Separator between the scope id and the slug in a registry key. */
export const KEY_SEP = "|";

/** Separator between the scope KIND tag and the scope id. */
const KIND_SEP = ":";

/**
 * Which namespace a scope id lives in. Without this tag the id spaces overlap —
 * a profile may legally be named `org_a1b2c3`, i.e. exactly an org id — and one
 * org's registry row becomes reachable from another identity.
 */
export type MountScopeKind = "org" | "profile" | "url";

/** The tagged identity a mount is namespaced by. */
export interface MountScopeIdentity {
  kind: MountScopeKind;
  id: string;
}

/**
 * The identity that namespaces a mount. Prefer the acting orgId (pinned at
 * mount time); fall back to the profile name, then the base URL, so a mount is
 * still scoped even when `--api-key`/`NEXUS_API_KEY` bypassed profiles and no
 * org could be resolved (the "unknown org" fallback bucket).
 */
export function mountScopeIdentity(scope: MountScope): MountScopeIdentity {
  if (scope.orgId) return { kind: "org", id: scope.orgId };
  if (scope.profile) return { kind: "profile", id: scope.profile };
  return { kind: "url", id: scope.baseUrl };
}

/**
 * Keep `KEY_SEP` out of a scope id, so `<kind>:<id>|<slug>` always splits at the
 * separator this module put there.
 *
 * Org ids and profile names cannot contain `|` — both are alphanumeric plus
 * `-`/`_`. The `url:` id can: `scope.baseUrl` is `--base-url` /`NEXUS_BASE_URL`/
 * profile config with only a trailing slash stripped, and "`|` is not legal in a
 * URL per RFC 3986" is a statement about well-formed URLs, not a guarantee about
 * a string a user typed. Percent-encoding it makes the key-space invariant
 * something this module enforces instead of something a comment claims.
 *
 * `%7C` is chosen over dropping or rejecting the character so the mapping stays
 * total and reversible-looking: a hand-inspected registry still shows which host
 * the row belongs to.
 */
function encodeScopeId(id: string): string {
  return id.includes(KEY_SEP) ? id.split(KEY_SEP).join("%7C") : id;
}

/** `<kind>:<id>` — the scope half of a registry key. */
export function scopeIdOfKind(kind: MountScopeKind, id: string): string {
  return `${kind}${KIND_SEP}${encodeScopeId(id)}`;
}

/**
 * Stable per-org identifier used to namespace a mount, TAGGED by kind
 * (`org:`/`profile:`/`url:`). The tag is what keeps a profile named after an
 * org id from addressing that org's mounts: the three tags differ in their
 * first character, so ids from DIFFERENT namespaces can never produce the same
 * string however they collide.
 *
 * Within a namespace they still can, and one namespace is deliberately coarse:
 * `url:` buckets every anonymous caller on a host together (see this file's
 * header). The tag argument is about cross-namespace collisions only.
 */
export function mountScopeId(scope: MountScope): string {
  const { kind, id } = mountScopeIdentity(scope);
  return scopeIdOfKind(kind, id);
}

/** Composite registry key: `<kind>:<id>|<slug>`. Slugs never contain `|`. */
export function mountKey(scope: MountScope, slug: string): string {
  return `${mountScopeId(scope)}${KEY_SEP}${slug}`;
}

/** A bare-slug key written before org-scoping existed (NEX-2360). */
export function isLegacyKey(key: string): boolean {
  return !key.includes(KEY_SEP);
}
