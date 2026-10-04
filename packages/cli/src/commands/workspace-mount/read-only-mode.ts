import type { WorkspaceKind } from "@agent-nexus/sdk";

import type { MountScope } from "../../mount-registry";
import { isReadOnlyKind } from "./is-read-only-kind";
import type { MountOutcome } from "./mount-outcome";

/** The one reason `--json` reports for a read-only drive: the cause the user cannot waive first. */
export function readOnlyReasonFor(input: {
  readonly kindForcesReadOnly: boolean;
  readonly requested: boolean;
  readonly granted: boolean;
}): "kind" | "requested" | "granted" | null {
  if (input.kindForcesReadOnly) return "kind";
  if (input.requested) return "requested";
  if (input.granted) return "granted";
  return null;
}

/** A CODE workspace is a read-only projection; the server refuses every write to it. */
export function kindForcesReadOnlyFor(storageKind: WorkspaceKind | undefined): boolean {
  return storageKind !== undefined && isReadOnlyKind(storageKind);
}

/** The EFFECTIVE mode: the flag, the kind, or a grade the server lowered — one definition for the row, the JSON and the summary. */
export function effectiveReadOnly(
  opts: { readonly readOnly?: boolean },
  storageKind: WorkspaceKind | undefined,
  mounted: MountOutcome
): boolean {
  return !!opts.readOnly || kindForcesReadOnlyFor(storageKind) || mounted.grantedReadOnly;
}

/** The mint's answer wins over the profile's saved copy — see `refreshProfileOrgName`. */
export function actingOrgNameFor(mounted: MountOutcome, scope: MountScope): string | undefined {
  return mounted.serverOrgName ?? scope.orgName;
}

/** This command's long-standing OWNERSHIP field (org-owned / admin-shared), not the storage kind. */
export function ownershipKindFor(useShared: boolean): "admin-shared" | "org-owned" {
  return useShared ? "admin-shared" : "org-owned";
}

/**
 * A read-only KIND forces a read-only MOUNT. The server refuses every
 * mutating verb against a CODE workspace, so a read-write mount grants
 * nothing a mount_webdav read-only one does not — it only moves the
 * refusal from mount time to save time, where it arrives as a bare
 * "Permission denied" naming no workspace and no reason. Under a local
 * write cache it is worse: the save succeeds and the bytes are dropped
 * at upload — which is why the direct engine refuses the kind outright
 * rather than mounting it read-only.
 *
 * `--read-only` can only ADD this, never remove it: a user asking for
 * read-write on a projection is asking for something the server has
 * already decided to refuse.
 */
export function requestedReadOnlyFor(
  opts: { readonly readOnly?: boolean },
  storageKind: WorkspaceKind | undefined
): boolean {
  return !!opts.readOnly || kindForcesReadOnlyFor(storageKind);
}
