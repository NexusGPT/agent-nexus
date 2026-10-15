import { handleError } from "../../../errors";
import { readMounts } from "../../../mount-registry";
import { color, isJsonMode } from "../../../output";
import { refreshVerdictIsUnhealthy } from "../../../workspace-direct-mount/refresh-verdict-is-unhealthy";
import { printStatusTable } from "./print-status-table";
import { profilePresence } from "./profile-presence";
import { reportUnhealthyMounts } from "./report-unhealthy-mounts";
import { statusRow } from "./status-row";

/**
 * A LOCAL read of the mount registry, never a server check — and the exit
 * code carries `live` and the renewal verdict, which is the half a script
 * reads.
 */
export function runWorkspaceStatus(): void {
  try {
    const mounts = readMounts();
    const now = new Date();
    const profileExists = profilePresence();
    const rows = Object.values(mounts).map((m) => statusRow(m, now, profileExists));
    const records = rows.map((row) => row.json);
    // 🚨 `live` IS THE ONE FACT A SCRIPT COMES HERE FOR, and the exit code
    // never said it. This command's own help already warns that a mount can
    // read Live yes and still fail every read — so the exit code is the only
    // cheap way a caller learns a drive it depends on is GONE, and it always
    // said "fine". A direct mount whose renewal cannot succeed is the same
    // fact one hour early.
    //
    // ⚠️ AN EMPTY REGISTRY IS NOT A FAILURE. "No workspaces mounted." means
    // nothing is recorded here, which the help is careful to say is not a
    // claim about what the OS has mounted. Exiting non-zero on it would
    // refuse a machine that is doing exactly what was asked of it.
    const dead = records.filter((r) => r.live === "no");
    // A dead row is reported once, as dead: its remount rewrites the session
    // and the config, so whatever else is wrong with it goes with the fix.
    const broken = rows
      .filter(
        (row) =>
          row.json.live === "yes" &&
          row.health !== null &&
          refreshVerdictIsUnhealthy(row.health.verdict)
      )
      .map((row) => ({ ...row.json, refresh: row.table.refresh }));
    const unhealthy = dead.length > 0 || broken.length > 0;

    if (isJsonMode()) {
      // Under --json a failure is the error document and NOTHING else.
      // Printing the rows and then refusing takes stdout with a document
      // that parses cleanly and never says a mount is gone — `error-masked`
      // in `json-one-document.scan.ts`.
      if (unhealthy) {
        process.exitCode = reportUnhealthyMounts(dead, broken);
      } else {
        console.log(JSON.stringify(records, null, 2));
      }
      return;
    }
    if (records.length === 0) {
      console.log(color.dim("No workspaces mounted."));
      return;
    }
    printStatusTable(rows);

    // The table above already shows a human which row reads "no"; the exit
    // code is the half a script reads, and it said nothing.
    if (unhealthy) {
      process.exitCode = reportUnhealthyMounts(dead, broken);
    }
  } catch (err) {
    process.exitCode = handleError(err);
  }
}
