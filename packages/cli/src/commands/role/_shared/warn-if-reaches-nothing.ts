import type { RolePermissionSetResourceReach } from "@agent-nexus/sdk";

import { printWarning } from "../../../output";

/**
 * Say so when a permission set reaches NOTHING.
 *
 * `no_surface` means a relation is set with an empty surface allow-list, so the
 * set grants no resource access at all while looking configured. The server
 * refuses that pair on a write, so this is a belt-and-braces read of what came
 * back — and it is cheap insurance against the day the refusal is relaxed.
 *
 * `capability_only` is NOT warned about: reaching no resources is the whole point
 * of a capability-only set, and warning on a chosen state trains the reader to
 * ignore the warning that matters.
 */
export function warnIfReachesNothing(reach: RolePermissionSetResourceReach): void {
  if (reach !== "no_surface") return;
  printWarning(
    "This permission set reaches NOTHING.",
    "It has a resource relation but an empty surfaces allow-list, and surfaces is a strict",
    'allow-list rather than a filter. Pass --surfaces "*" for every surface, name the',
    "surfaces you mean, or --relation none for a capability-only set."
  );
}
