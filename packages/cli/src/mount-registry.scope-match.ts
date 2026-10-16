import { KEY_SEP, scopeIdOfKind } from "./mount-registry.key";
import type { MountRecord, MountScope } from "./mount-registry.model";

/**
 * WHICH ROWS THE ACTING SCOPE MAY TOUCH — from both sides.
 *
 * A key answers who WROTE a row; the record itself carries the org that was
 * pinned at mount time. `findMount` asks both, which is why the two live
 * together here.
 *
 * The anonymous `url:` bucket is confined to the callers that can produce one.
 * `mountScopeId` reaches `url:` only when there is no orgId and no profile, so
 * an IDENTIFIED caller never writes such a row — and `scopeCandidateKeys`
 * therefore never offers one back to it. Doing so was a cross-org hole in both
 * directions: it refused an identified org a mount of its own slug, and it let
 * `unmount <slug>` detach an anonymous caller's live drive and delete its row.
 */

/**
 * Every registry key the active scope could have produced for `slug`, in
 * priority order. `mountScopeId` prefers orgId but falls back to profile (or
 * base URL) — so a mount written before login filled in orgId is keyed by the
 * profile name, and the canonical orgId-based key would miss it. Matching all
 * of a scope's identifiers absorbs that drift. Each candidate is tagged with
 * its own kind, so the profile candidate can only ever hit rows this profile
 * wrote and the org candidate only rows that org wrote — a profile named like
 * an org id addresses `profile:<name>|<slug>`, never `org:<name>|<slug>`.
 */
export function scopeCandidateKeys(scope: MountScope, slug: string): string[] {
  const keys: string[] = [];
  if (scope.orgId) keys.push(`${scopeIdOfKind("org", scope.orgId)}${KEY_SEP}${slug}`);
  if (scope.profile) keys.push(`${scopeIdOfKind("profile", scope.profile)}${KEY_SEP}${slug}`);
  // The base-URL key belongs to ANONYMOUS callers only, so only an anonymous
  // scope may claim it.
  //
  // `mountScopeId` prefers orgId, then profile, and reaches `url:<baseUrl>` only
  // when neither exists — so an identified caller can never have WRITTEN a
  // `url:` row. Offering it to one anyway is a cross-org hole, not a fallback:
  // that key is a single bucket per (base URL, slug) shared by every anonymous
  // caller on the host, and an anonymous record names no owner for
  // `ownerConflictsWithScope` to reject. An identified org therefore matched a
  // row it cannot own — which blocked its own `mount` of the slug at a
  // different path (the very independence NEX-2360 exists to give it) and, far
  // worse, let `unmount <slug>` OS-detach a DIFFERENT org's live drive and
  // delete the row, silently.
  //
  // The cost of the narrowing is bounded and visible: a caller who mounted
  // anonymously and has since logged in no longer reaches that row by slug.
  // `unmount` answers with the candidate list from `findMountsBySlug` — "it is
  // mounted for: …" — instead of guessing, and the row stays reachable from the
  // anonymous scope that created it. Failing to find your own mount is
  // recoverable; detaching someone else's is not.
  if (!scope.orgId && !scope.profile) {
    keys.push(`${scopeIdOfKind("url", scope.baseUrl)}${KEY_SEP}${slug}`);
  }
  return keys;
}

/**
 * True when a record's recorded owner identifies a *different* org/profile than
 * the active scope, i.e. the row is not ours to read, replace, or unmount.
 *
 * `findMount` runs this on EVERY candidate it matches, not just the base-URL
 * one: a key alone proves only that some scope with that (kind, id) wrote the
 * row, while the record itself carries the identity that was pinned at mount
 * time. Checking both means a drifted or hand-edited registry can't route one
 * org's action onto another org's row even if the key lines up.
 *
 * The ladder, in order:
 *   - A record naming NO owner at all is the anonymous base-URL-bucket mount
 *     (raw `--api-key`, no resolvable org). It never conflicts — finding it is
 *     exactly what the base-URL candidate exists for.
 *   - When both sides name an org, the ORG decides and the profiles are
 *     irrelevant: the registry is org-scoped, so a second profile on the same
 *     org must resolve that org's mount.
 *   - Otherwise only profile identity is comparable; same profile, same owner.
 *   - Anything left names an org/profile the other side cannot see. That is
 *     unverifiable, so treat it as a conflict rather than guess.
 */
export function ownerConflictsWithScope(record: MountRecord, scope: MountScope): boolean {
  if (!record.orgId && !record.profile) return false;
  if (record.orgId && scope.orgId) return record.orgId !== scope.orgId;
  if (record.profile && scope.profile) return record.profile !== scope.profile;
  return true;
}
