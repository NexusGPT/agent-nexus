import { printWarning } from "../../../output";

/**
 * Say out loud when a permission set list is not yet the Role's answer.
 *
 * `[]` from the server means one of two completely different things and the bytes
 * are identical: nothing has been seeded yet, or the Role genuinely has no sets.
 * Only `readiness` tells them apart, and only `roles get` / `roles list` carry it
 * — so a caller reading `permission-sets` alone cannot know. Printing the warning
 * where the empty list is rendered is what stops an operator "fixing" it by hand
 * and getting duplicates when the reconciler runs.
 */
export function warnIfPermissionSetsMayBePending(count: number): void {
  if (count > 0) return;
  printWarning(
    "This Role reports no permission sets.",
    "An empty list can mean the system sets have not been seeded YET — they are written by a",
    "background reconciler, not at Role creation. Run `nexus role get <role>` and read",
    "readiness.permissionSets: PENDING means retry, READY means this list is the answer.",
    "Do NOT create sets by hand to fill the gap; the reconciler writes them anyway."
  );
}
