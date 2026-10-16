/**
 * Verbs that name the destruction or surrender of something already stored.
 *
 * Matched against the WORDS of a leaf's path below the top-level namespace,
 * split on spaces and hyphens — so `tool delete-credential` matches on
 * `delete` and `role revoke-workspace` on `revoke`, while a namespace that
 * happens to contain a verb does not drag its reads in.
 *
 * ⚠️ OVER-MATCHING IS THE CHEAP DIRECTION AND IS CHOSEN ON PURPOSE. Every
 * false positive costs one reasoned line in `NOT_DESTRUCTIVE`, which a
 * reviewer reads. Every false NEGATIVE is a destructive command nothing asks
 * about, which is the failure this file exists for.
 */
export const DESTRUCTIVE_VERBS: readonly string[] = [
  "abort",
  "cancel",
  "delete",
  "destroy",
  "detach",
  "disable",
  "drop",
  "logout",
  "prune",
  "purge",
  "release",
  "remove",
  "reset",
  "restore",
  "revert",
  "revoke",
  "rm",
  "rotate",
  "truncate",
  "uninstall",
  "unmount",
  "unpin",
  "unpublish",
  "wipe"
];

/** True when this leaf's own words — never its namespace — carry a destructive verb. */
export function carriesDestructiveVerb(path: string): boolean {
  const words = path
    .split(" ")
    .slice(1)
    .flatMap((segment) => segment.split("-"));
  return words.some((word) => DESTRUCTIVE_VERBS.includes(word));
}
