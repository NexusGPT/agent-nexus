import type { Engine, MountRecord } from "../../mount-registry";
import { isJsonMode, printSuccess } from "../../output";
import type { MountOutcome } from "./mount-outcome";
import { printGrantedReadOnly } from "./print-granted-read-only";
import { printMountFooter } from "./print-mount-footer";
import { printPendingUploads } from "./print-pending-uploads";

/** What `remount` tells the caller once the row has been replayed and rewritten. */
export interface RemountReport {
  readonly slug: string;
  readonly engine: Engine;
  readonly record: MountRecord;
  readonly mounted: MountOutcome;
  /** The mode ASKED for; the drive may still have come back read-only. */
  readonly requestedReadOnly: boolean;
  readonly actingOrgName: string | undefined;
}

export function reportRemount(report: RemountReport): void {
  const { slug, engine, record, mounted, actingOrgName } = report;
  const readOnly = report.requestedReadOnly || mounted.grantedReadOnly;
  if (isJsonMode()) {
    console.log(
      JSON.stringify(
        {
          remounted: true,
          slug,
          engine,
          mountPath: record.mountPath,
          readOnly,
          pid: mounted.record.pid ?? null,
          mountId: mounted.record.mountId ?? null,
          access: mounted.record.access ?? null,
          pendingUploads: mounted.pendingUploads
        },
        null,
        2
      )
    );
    return;
  }
  printSuccess(`Remounted "${slug}" at ${record.mountPath}`, {
    engine,
    mode: readOnly ? "read-only" : "read-write",
    ...(actingOrgName || record.orgId ? { org: actingOrgName ?? record.orgId } : {}),
    ...(record.profile ? { profile: record.profile } : {})
  });
  if (mounted.grantedReadOnly) printGrantedReadOnly(slug);
  printPendingUploads(mounted.pendingUploads);
  printMountFooter(engine, slug);
}
