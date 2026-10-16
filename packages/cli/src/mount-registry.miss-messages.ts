import { candidateList, describeScope } from "./mount-registry.describe";
import type { MountRecord, MountScope } from "./mount-registry.model";

/**
 * WHAT `unmount` AND `remount` SAY WHEN THE SLUG IS RECORDED FOR SOMEBODY ELSE.
 *
 * Both verbs act on a real drive, so the text here is the entire remedy the
 * user gets. Pure functions, because inside a commander action nothing can
 * assert it.
 */

/**
 * The slug IS recorded, but for other owners than the acting scope. `unmount`
 * says the rows are "mounted", `remount` that they are "recorded" — the drive
 * may be dead by then — and both name the same remedy.
 */
export function ownedElsewhereMessage(
  slug: string,
  candidates: readonly { readonly record: MountRecord }[],
  scope: MountScope,
  state: "mounted" | "recorded"
): string {
  return (
    `No mount of "${slug}" is recorded for ${describeScope(scope)}, but it is ${state} for:\n` +
    `${candidateList(candidates)}\nSwitch to the owning profile/org (nexus auth switch / nexus auth use-org) and retry.`
  );
}

/**
 * What `unmount <slug>` says when the slug IS mounted but not for this scope.
 *
 * A pure function on purpose: this text is the entire remedy the user gets, it
 * has been wrong twice, and inside a commander action nothing can assert it.
 * The three branches are three different situations, and advice that fits one
 * of them is actively misleading in the others.
 *
 * The middle branch is the one that keeps getting missed. Every candidate can
 * be UNOWNED — the anonymous base-URL bucket, which an identified scope
 * deliberately no longer resolves — and then "switch to the owning profile/org"
 * names a profile and an org that do not exist. That is the exact state of a
 * caller who mounted with a raw `--api-key` and has since logged in, and the
 * advice would leave them circling a live mount forever.
 */
export function unmountMissMessage(
  slug: string,
  candidates: readonly { readonly record: MountRecord }[],
  scope?: MountScope
): string {
  const list = candidateList(candidates);

  // Unknown scope covers a typo'd `--profile` (the lookup throws and
  // resolveScopeBestEffort swallows it), a raw `--api-key` with no
  // NEXUS_ORGANIZATION_ID, and a machine with no profile at all. `unmount`
  // detaches a real drive, so name the owners and make the user pick rather than
  // acting on a guess — including when there is only ONE candidate, which is
  // exactly the case where guessing looks safest and is still someone else's
  // mount.
  if (!scope) {
    return (
      `"${slug}" is mounted, but the active org could not be resolved, so the CLI cannot ` +
      `tell whose mount to detach:\n${list}\nRe-run with --profile <name> (or set ` +
      `NEXUS_ORGANIZATION_ID) to pick one.`
    );
  }

  if (candidates.every((c) => !c.record.orgId && !c.record.profile)) {
    return (
      `No mount of "${slug}" is recorded for ${describeScope(scope)}. It is mounted ` +
      `without an organization:\n${list}\nThat row was written by a caller with no ` +
      `resolvable org, so there is no profile or org to switch to. Re-run with ` +
      `--api-key and no NEXUS_ORGANIZATION_ID to act as that caller, or unmount the ` +
      `path directly with your platform tool (umount / fusermount -u).`
    );
  }

  return ownedElsewhereMessage(slug, candidates, scope, "mounted");
}
