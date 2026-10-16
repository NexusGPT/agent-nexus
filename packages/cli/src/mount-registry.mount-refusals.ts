import { describeOwner } from "./mount-registry.describe";
import type { MountRecord, MountScope } from "./mount-registry.model";

/**
 * WHAT `mount` SAYS WHEN IT WILL NOT MOUNT.
 *
 * Pure functions, and here rather than inline in the commander action, for the
 * reason `unmountMissMessage` states in `mount-registry.miss-messages.ts`: this
 * text IS the remedy, and inside an action nothing can assert it.
 */

/**
 * What `mount <slug>` says when this scope already holds a LIVE mount of it.
 *
 * Pure, and here rather than inline in the action, for the reason
 * `unmountMissMessage` states: this text IS the remedy, and inside a
 * commander action nothing can assert it. Three situations, three different
 * ways out, written as early returns because advice that does not hold for the
 * caller reading it is worse than none:
 *
 *   - an OWNED row: it is theirs, so "unmount it first" is safe to say.
 *   - an UNOWNED row and an IDENTIFIED caller: the anonymous base-URL bucket is
 *     already unreachable for them, so the only unowned row left to match is a
 *     legacy bare-slug entry from before org scoping. Logging in is what put
 *     them here, so it cannot be the fix — name the row and leave the judgement
 *     with the one person who can make it.
 *   - an UNOWNED row and an ANONYMOUS caller: every raw `--api-key` caller with
 *     no NEXUS_ORGANIZATION_ID shares one entry per base URL + slug, so the row
 *     may be someone else's. Identifying themselves is the real escape: it
 *     moves them to a key of their own and `scopeCandidateKeys` stops offering
 *     them this bucket at all.
 */
export function alreadyMountedMessage(
  slug: string,
  record: MountRecord,
  scope: MountScope
): string {
  const head =
    `Workspace "${slug}" is already mounted at ${record.mountPath} for ` +
    `${describeOwner(record)}. `;
  if (record.orgId || record.profile) return `${head}Unmount it first.`;
  if (scope.orgId || scope.profile) {
    return (
      `${head}That record predates org-scoped mounts and names no organization, so the ` +
      `CLI cannot tell whether it is yours. Unmount it only if you know it is — ` +
      `otherwise mount at a different path with --at.`
    );
  }
  return (
    `${head}That record names no organization: mounts made with a raw ` +
    `--api-key/NEXUS_API_KEY and no NEXUS_ORGANIZATION_ID all share one registry ` +
    `entry per base URL + slug, so it may belong to a different org than yours. ` +
    "Run `nexus auth login` or set NEXUS_ORGANIZATION_ID so the two can be told " +
    `apart — do not unmount it unless you know it is yours.`
  );
}

/** What `mount` says when another scope's row already holds the mount POINT. */
export function mountPointTakenMessage(
  mountPath: string,
  other: MountRecord,
  slug: string
): string {
  return (
    `Mount point ${mountPath} is already in use by ${describeOwner(other)}'s mount of ` +
    `"${other.slug}". Mount points are machine-wide, whatever org a row belongs to. ` +
    `Mount "${slug}" elsewhere with --at <path>, or unmount that workspace first.`
  );
}
