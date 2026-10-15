import type { MountRecord } from "../../mount-registry";
import { color, isJsonMode, printSuccess } from "../../output";
import { describePendingUploads } from "../../workspace-direct-mount/pending-uploads-unknown";
import type { DirectLeftovers } from "../../workspace-direct-mount/remove-direct-session";
import { jsonPendingUploads } from "./json-pending-uploads";

/**
 * What `unmount` tells the caller once the drive is detached and its row gone.
 * `leftovers` is null on every engine but direct, which is the only one with a
 * session and a cache of its own to account for.
 */
export function reportUnmount(
  slug: string,
  record: MountRecord,
  leftovers: DirectLeftovers | null
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
  if (leftovers !== null && leftovers.pendingUploads > 0) {
    console.log(
      color.yellow(
        `  ${describePendingUploads(leftovers.pendingUploads)} file(s) not yet uploaded; ` +
          `nexus workspace mount ${slug} --engine direct uploads them.`
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
