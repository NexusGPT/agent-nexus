import type { MountRecord, MountScope } from "./mount-registry.model";

/**
 * NAMING AN OWNER, A SCOPE, AND A LIST OF CANDIDATE ROWS.
 *
 * Every refusal message in `mount-registry.mount-refusals.ts` and
 * `mount-registry.miss-messages.ts` is built from these three, so the way a
 * mount's owner is written is decided once.
 */

/** Human-readable description of which org/profile owns a mount. */
export function describeOwner(record: MountRecord): string {
  if (record.orgName && record.profile) {
    return `org "${record.orgName}" (profile "${record.profile}")`;
  }
  if (record.orgName) return `org "${record.orgName}"`;
  if (record.orgId && record.profile) {
    return `org ${record.orgId} (profile "${record.profile}")`;
  }
  if (record.orgId) return `org ${record.orgId}`;
  if (record.profile) return `profile "${record.profile}"`;
  return `base URL ${record.baseUrl}`;
}

/** Human-readable description of the active scope, for error messages. */
export function describeScope(scope: MountScope): string {
  if (scope.orgName) return `org "${scope.orgName}"`;
  if (scope.orgId) return `org ${scope.orgId}`;
  if (scope.profile) return `profile "${scope.profile}"`;
  return `base URL ${scope.baseUrl}`;
}

/** One line per candidate row: who owns it, and where it sits. */
export function candidateList(candidates: readonly { readonly record: MountRecord }[]): string {
  return candidates
    .map((candidate) => `  - ${describeOwner(candidate.record)} at ${candidate.record.mountPath}`)
    .join("\n");
}
