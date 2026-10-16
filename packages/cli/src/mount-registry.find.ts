import { isLegacyKey } from "./mount-registry.key";
import type { MountRecord, MountScope } from "./mount-registry.model";
import { ownerConflictsWithScope, scopeCandidateKeys } from "./mount-registry.scope-match";

/**
 * FINDING A RECORDED MOUNT BY SLUG.
 *
 * Migration: legacy bare-slug entries (pre-NEX-2360) remain readable and are
 * matched as a fallback (see `findMount`). They migrate on first touch — a new
 * mount of the slug replaces the stale legacy row with a scoped one, and an
 * unmount removes it. No proactive rewrite of the registry file is performed.
 */

/**
 * Locate a recorded mount for `slug`, scoped to `scope` when known.
 *
 * Resolution order:
 *   1. Any of the active scope's candidate keys (orgId and profile; the base-URL
 *      key only for a scope that has neither — see `scopeCandidateKeys`), so a
 *      mount survives orgId-vs-profile key drift across logins.
 *   2. Legacy bare-slug key — a pre-NEX-2360 entry with no org recorded.
 *   3. A unique record whose `slug` matches AND names no owner — ONLY when the
 *      scope is unknown (e.g. `unmount` run without resolvable auth). Skipped
 *      when ambiguous so we never guess between two orgs' mounts of the same
 *      slug, and skipped when the one match names an org/profile, because an
 *      unknown scope cannot show that row is its own. Either way the caller
 *      should list the candidates (`findMountsBySlug`) instead.
 *
 * EVERY match — scoped or legacy — is then checked against the record's own
 * recorded owner (`ownerConflictsWithScope`). The key proves which scope wrote
 * the row; the record proves which org it was pinned to. Both must agree before
 * we hand a caller a row it may unmount, replace, or delete.
 *
 * When the scope IS known, resolution stops after the scoped + legacy keys: a
 * cross-scope slug match is never used, so `unmount` on org A can never detach
 * org B's mount of the same slug — the very org-blindness NEX-2360 fixes.
 *
 * Used by the mount guard too: it must see the same scoped + legacy entries so a
 * still-live pre-upgrade (or pre-drift) mount of the slug blocks a duplicate.
 */
export function findMount(
  mounts: Record<string, MountRecord>,
  slug: string,
  scope?: MountScope
): { key: string; record: MountRecord } | undefined {
  if (scope) {
    for (const key of scopeCandidateKeys(scope, slug)) {
      const record = mounts[key];
      if (!record) continue;
      // The key is tagged by kind, so it can only have been written by a scope
      // with this same (kind, id) — but a record still carries the org that was
      // pinned at mount time, which a re-login or a hand-edited registry can put
      // at odds with the key. Verify the recorded owner on every candidate: the
      // key answers who WROTE the row, the record who it was pinned to, and a
      // registry that has drifted between the two must route nobody's action
      // onto anybody else's row.
      if (ownerConflictsWithScope(record, scope)) continue;
      return { key, record };
    }
  }
  if (mounts[slug] && isLegacyKey(slug)) {
    // Legacy rows predate org recording, so they normally name no owner and
    // never conflict. One that DOES name another org (upgraded then hand-edited)
    // is not ours to touch.
    const record = mounts[slug];
    if (!scope || !ownerConflictsWithScope(record, scope)) return { key: slug, record };
  }

  // Slug-only match is a last resort for an unknown scope. With a known scope we
  // have already checked its candidate keys, so falling through here could
  // detach a different org's mount of the same slug.
  if (scope) return undefined;
  const matches = Object.entries(mounts).filter(([, r]) => r.slug === slug);
  if (matches.length !== 1) return undefined;
  const [key, record] = matches[0];
  // Uniqueness is not ownership. `unmount` OS-detaches and deletes whatever this
  // returns, and an unknown scope is reached by ordinary accidents — a typo'd
  // `--profile` (resolveProfile throws, the caller swallows it), a raw
  // `--api-key`/`NEXUS_API_KEY` with no `NEXUS_ORGANIZATION_ID`, a machine with
  // no profile configured. Handing back a row that NAMES an org/profile in that
  // state is the same cross-org destructive action the scoped path exists to
  // prevent, just reached from the other side: the caller cannot show the row is
  // theirs, and the row says whose it is. Refuse, and let the caller list the
  // candidates so the user names an org instead of the CLI guessing one.
  //
  // A record naming NO owner is still returned: that is the anonymous
  // base-URL-bucket mount (or a legacy pre-NEX-2360 row), where there is no
  // identity to contradict and refusing would strand a live mount with no way to
  // detach it.
  if (record.orgId || record.profile) return undefined;
  return { key, record };
}

/**
 * All recorded mounts of `slug`, across every org/scope. Used to disambiguate:
 * when a scoped (or unscoped) lookup finds nothing, the caller lists these so
 * the error names the orgs that DO have the slug mounted instead of a bare
 * "No mount recorded" (NEX-2360).
 */
export function findMountsBySlug(
  mounts: Record<string, MountRecord>,
  slug: string
): { key: string; record: MountRecord }[] {
  return Object.entries(mounts)
    .filter(([, r]) => r.slug === slug)
    .map(([key, record]) => ({ key, record }));
}
