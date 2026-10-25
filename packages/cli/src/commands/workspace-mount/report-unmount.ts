import type { MountRecord } from "../../mount-registry";
import { color, isJsonMode, printSuccess } from "../../output";
import { mountFix } from "../../workspace-direct-mount/mount-fix";
import { describePendingUploads } from "../../workspace-direct-mount/pending-uploads-unknown";
import type { MountLeftovers } from "../../workspace-direct-mount/remove-direct-session";
import { jsonPendingUploads } from "./json-pending-uploads";
import type { ExitRequest } from "./unmount-path";

/**
 * Whether the drive was killed where it should have closed itself: Explorer
 * then keeps a dead drive in "This PC" until the window is refreshed, and the
 * one line that says so is owed. Never on macOS or Linux, where the OS unmount
 * is the ask and the kill after it is routine.
 */
function wasKilledUnasked(asked: ExitRequest | null): boolean {
  return asked !== null && asked !== "exited" && asked !== "not-asked";
}

/**
 * What `unmount` tells the caller once the drive is detached and its row gone.
 * `leftovers` is null where nothing is tracked — the webdav engine, and an
 * rclone row mounted before drives had their own cache folder.
 */
export function reportUnmount(
  slug: string,
  record: MountRecord,
  leftovers: MountLeftovers | null,
  asked: ExitRequest | null
): void {
  if (isJsonMode()) {
    console.log(
      JSON.stringify(
        {
          unmounted: true,
          slug,
          pendingUploads: jsonPendingUploads(leftovers?.pendingUploads),
          accessValidUntil: leftovers?.accessValidUntil ?? null
        },
        null,
        2
      )
    );
    return;
  }
  printSuccess(`Unmounted "${slug}" (${record.mountPath})`);
  if (wasKilledUnasked(asked)) {
    console.log(
      color.dim(
        "  rclone did not close itself and was ended; if Explorer still shows the drive, refresh that window (F5)."
      )
    );
  }
  if (leftovers !== null && leftovers.pendingUploads > 0) {
    console.log(
      color.yellow(
        `  ${describePendingUploads(leftovers.pendingUploads)} file(s) not yet uploaded; ` +
          `${mountFix(slug, record.shared === true, record.engine)} uploads them.`
      )
    );
  }
  if (leftovers?.accessValidUntil) {
    console.log(
      color.dim(
        `  The last minted access stays valid until ${leftovers.accessValidUntil}; AWS has no revoke call for it.`
      )
    );
  }
}
