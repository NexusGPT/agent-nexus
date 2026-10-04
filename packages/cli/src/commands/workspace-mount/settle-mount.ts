import type { WorkspaceKind } from "@agent-nexus/sdk";

import type { Engine, MountRecord, MountScope } from "../../mount-registry";
import { writeClaudeMdNote } from "./claude-md-note";
import type { MountOutcome } from "./mount-outcome";
import { printMountReport } from "./mount-report";
import type { MountTarget } from "./mount-target";
import { actingOrgNameFor, effectiveReadOnly } from "./read-only-mode";
import { recordMount } from "./record-mount";

/** Everything the settle step needs from the mount that just succeeded. */
export interface SettleMountInput {
  readonly mounts: Record<string, MountRecord>;
  readonly key: string;
  readonly slug: string;
  readonly engine: Engine;
  readonly mountPath: string;
  readonly useShared: boolean;
  readonly requestedReadOnly: boolean;
  readonly target: MountTarget | null;
  readonly storageKind: WorkspaceKind | undefined;
  readonly scope: MountScope;
  readonly opts: { readonly readOnly?: boolean; readonly claudeMd?: boolean };
  readonly mounted: MountOutcome;
}

/**
 * Record the live mount, write the optional CLAUDE.md note, and report — the
 * whole of what happens once the drive is up.
 *
 * The EFFECTIVE mode: the flag, the kind, or a grade the server
 * lowered. The row records the REQUEST (`readOnly`) and the grant
 * (`access`) separately, so `remount` can ask for the same thing again
 * and come back read-write once a lost grant is restored; `modeOf`
 * joins the two for `workspace status`.
 *
 * The mint's answer wins over the profile's saved copy — see
 * `refreshProfileOrgName`. One definition (`actingOrgNameFor`) so the
 * row, the JSON and the printed summary cannot disagree about which
 * name they show.
 */
export function settleMount(input: SettleMountInput): void {
  const { mounts, key, slug, engine, mountPath, useShared, requestedReadOnly } = input;
  const { target, storageKind, scope, opts, mounted } = input;
  const { record } = mounted;

  const readOnly = effectiveReadOnly(opts, storageKind, mounted);
  const actingOrgName = actingOrgNameFor(mounted, scope);
  const workspaceId = record.workspaceId ?? target?.workspaceId;
  recordMount(mounts, key, record, {
    useShared,
    requestedReadOnly,
    scope,
    actingOrgName,
    workspaceId
  });

  let claudeMdTarget: string | null = null;
  if (opts.claudeMd) {
    claudeMdTarget = writeClaudeMdNote(slug, mountPath, readOnly);
  }

  // Ambiguous = both copies exist. Warn whenever we resolved one while
  // the other was reachable, so the user can tell which drive they got.
  const ambiguous = !!target?.shared && !!target?.orgOwned;

  printMountReport({
    slug,
    engine,
    mountPath,
    useShared,
    workspaceId,
    ambiguous,
    record,
    opts,
    mounted,
    storageKind,
    scope,
    claudeMdTarget
  });
}
