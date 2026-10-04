import type { WorkspaceKind } from "@agent-nexus/sdk";

import type { Engine, MountRecord, MountScope } from "../../mount-registry";
import { color, isJsonMode, printSuccess } from "../../output";
import { printMountFooter } from "../workspace-mount-direct";
import type { MountOutcome } from "./mount-outcome";
import { printGrantedReadOnly } from "./print-granted-read-only";
import { printPendingUploads } from "./print-pending-uploads";
import {
  actingOrgNameFor,
  effectiveReadOnly,
  kindForcesReadOnlyFor,
  ownershipKindFor,
  readOnlyReasonFor
} from "./read-only-mode";

/**
 * What the `mount` action settled before it reports. Only the settled INPUTS
 * travel here; the mode, the ownership kind and the acting org name are derived
 * by the helpers above, so no caller can hand the printer two values that
 * disagree.
 */
export interface MountReport {
  readonly slug: string;
  readonly engine: Engine;
  readonly mountPath: string;
  readonly useShared: boolean;
  readonly workspaceId: string | undefined;
  /** Both copies of the slug exist, so the summary says which one was mounted. */
  readonly ambiguous: boolean;
  readonly record: MountRecord;
  /** The `--read-only` flag as passed, read to name the reason for a read-only drive. */
  readonly opts: { readonly readOnly?: boolean };
  readonly mounted: MountOutcome;
  readonly storageKind: WorkspaceKind | undefined;
  readonly scope: MountScope;
  readonly claudeMdTarget: string | null;
}

/** The `--json` document for one mount that succeeded; key order is the shipped contract. */
export function mountReportJson(report: MountReport): Record<string, unknown> {
  const { slug, engine, mountPath, useShared, workspaceId, ambiguous, record } = report;
  const { opts, mounted, storageKind, scope, claudeMdTarget } = report;
  return {
    mounted: true,
    slug,
    engine,
    mountPath,
    kind: ownershipKindFor(useShared),
    shared: useShared,
    workspaceId: workspaceId ?? null,
    ambiguous,
    pid: record.pid ?? null,
    readOnly: effectiveReadOnly(opts, storageKind, mounted),
    // Distinct keys on purpose: `readOnly` is what the mount IS,
    // `readOnlyReason` is WHY. A script that only reads `readOnly`
    // keeps working; one that wants to explain the mode to a human
    // has the cause without re-deriving it from `storageKind`.
    readOnlyReason: readOnlyReasonFor({
      kindForcesReadOnly: kindForcesReadOnlyFor(storageKind),
      requested: !!opts.readOnly,
      granted: mounted.grantedReadOnly
    }),
    // The STORAGE kind (DRIVE / CODE), null when the list could
    // not be fetched. NOT the `kind` key beside it, which is this
    // command's long-standing OWNERSHIP field (org-owned /
    // admin-shared) and keeps its meaning for existing scripts.
    storageKind: storageKind ?? null,
    orgId: scope.orgId ?? null,
    orgName: actingOrgNameFor(mounted, scope) ?? null,
    profile: scope.profile ?? null,
    mountId: record.mountId ?? null,
    access: record.access ?? null,
    pendingUploads: mounted.pendingUploads,
    claudeMd: claudeMdTarget
  };
}

/** The `--json` document, or the human summary, for one mount that succeeded. */
export function printMountReport(report: MountReport): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(mountReportJson(report), null, 2));
    return;
  }
  const { slug, engine, mountPath, useShared, workspaceId, ambiguous } = report;
  const { opts, mounted, storageKind, scope, claudeMdTarget } = report;
  const kind = ownershipKindFor(useShared);
  const readOnly = effectiveReadOnly(opts, storageKind, mounted);
  const kindForcesReadOnly = kindForcesReadOnlyFor(storageKind);
  const actingOrgName = actingOrgNameFor(mounted, scope);
  printSuccess(`Mounted "${slug}" at ${mountPath}`, {
    engine,
    kind,
    mode: readOnly ? "read-only" : "read-write",
    ...(actingOrgName || scope.orgId ? { org: actingOrgName ?? scope.orgId } : {}),
    ...(scope.profile ? { profile: scope.profile } : {})
  });
  if (kindForcesReadOnly) {
    console.log(
      color.yellow(
        `  Mounted READ-ONLY: "${slug}" is a ${storageKind} workspace — a read-only ` +
          `projection of a git project, and the server refuses every write to it. ` +
          `Mounting read-write would accept your saves locally and lose them. ` +
          `Change the files by pushing to the git project instead.`
      )
    );
  }
  if (mounted.grantedReadOnly) printGrantedReadOnly(slug);
  printPendingUploads(mounted.pendingUploads);
  if (ambiguous) printAmbiguityNote(slug, useShared, workspaceId);
  if (claudeMdTarget) {
    console.log(color.dim(`  Wrote workspace note to ${claudeMdTarget}`));
  }
  printMountFooter(engine, slug);
}

/** Both copies of the slug exist: say which one was mounted and how to get the other. */
export function printAmbiguityNote(
  slug: string,
  useShared: boolean,
  workspaceId: string | undefined
): void {
  const idNote = workspaceId ? ` (id ${workspaceId})` : "";
  const counterpart = useShared
    ? `drop --shared to mount the org-owned copy`
    : `pass --shared to mount the admin-shared copy instead`;
  console.log(
    color.yellow(
      `  Note: "${slug}" exists as BOTH an org-owned and an admin-shared workspace. ` +
        `Mounted the ${ownershipKindFor(useShared)} one${idNote}; ${counterpart}.`
    )
  );
}
