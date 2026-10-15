import { reportFailure } from "../../../errors";
import { firstNonBlankOr } from "../../../util/present-text";

/** The fields the status refusal names a row by. */
interface StatusRowIdentity {
  readonly slug: string;
  readonly orgName: string | null;
  readonly orgId: string | null;
  readonly mountPath: string;
}

function describeStatusRow(row: StatusRowIdentity): string {
  return `  ${row.slug}  [${firstNonBlankOr([row.orgName, row.orgId], "org not recorded")}]  ${row.mountPath}`;
}

/**
 * PRINT the refusal an unhealthy registry means and RETURN its exit code.
 *
 * Two shapes share one document: rows whose mount is GONE, and direct rows
 * whose mount may be live but whose next renewal cannot succeed — a failed
 * refresh with a non-transient reason, or a session, path or profile the
 * helper needs that is no longer there. Both are `local-failed`, and the
 * category's own declaration is the whole argument: "a local operation this
 * CLI performed failed … nothing about the caller's input is wrong and no
 * retry against the API helps". No server is involved in this command at all
 * — it reads the local registry — so `remote-error` would name a host that was
 * never contacted.
 *
 * ⚠️ ASSIGN THE RETURN VALUE. `reportFailure` only writes the document; a bare
 * call emits a perfect error and exits `0`, which is the class this change is
 * draining.
 */
export function reportUnhealthyMounts(
  dead: readonly StatusRowIdentity[],
  broken: readonly (StatusRowIdentity & { readonly refresh: string })[]
): number {
  const lines: string[] = [];
  if (dead.length > 0) {
    // 🚨 THE MOUNT POINT, NEVER THE SLUG ALONE. The same slug can be mounted
    // for several organizations — `workspace status` exists partly to show
    // that — and under --json this document REPLACES the rows, so a message
    // naming only the slug leaves a reader unable to tell WHICH of two mounts
    // died. The path is the one field that is unique per mount by
    // construction: `workspace mount` refuses a mount point another org
    // already holds.
    lines.push(
      `${String(dead.length)} recorded mount(s) are NOT live:`,
      ...dead.map(describeStatusRow)
    );
  }
  if (broken.length > 0) {
    lines.push(
      `${String(broken.length)} direct mount(s) cannot renew their access:`,
      ...broken.map((row) => `${describeStatusRow(row)}\n    ${row.refresh}`)
    );
  }
  const hints: string[] = [];
  if (dead.length > 0) {
    // ⚠️ NO BARE "unmount <slug>" HERE. That verb RESOLVES BY ACTING ORG and
    // takes no path, so on a slug mounted for two orgs it can detach the LIVE
    // one and leave the dead row that caused this exit. Its own refusal lists
    // the candidates when the acting org owns none of them, which is the safe
    // route — so the reader is pointed at the path and told what decides.
    hints.push(
      'A row reading live:no means the LOCAL mount is gone; it says nothing about the workspace on the server. "workspace unmount" and "workspace remount" resolve by ACTING ORG and take no path, so switch profile or pass --profile to reach the org named above before using either — on a slug mounted for two orgs they can otherwise act on the live one.'
    );
  }
  if (broken.length > 0) {
    hints.push(
      "A renewal that cannot succeed leaves the drive erroring on every click once its access expires; each row above names its fix."
    );
  }
  return reportFailure("local-failed", lines.join("\n"), hints.join(" "));
}
