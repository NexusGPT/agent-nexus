import { failure } from "../../errors";
import { describeOwner, type MountRecord } from "../../mount-registry";
import { countPendingUploads } from "../../workspace-direct-mount/count-pending-uploads";
import { discardPendingSavesHint } from "../../workspace-direct-mount/discard-pending-saves-hint";
import { describePendingUploads } from "../../workspace-direct-mount/pending-uploads-unknown";
import { remountFix } from "../../workspace-direct-mount/remount-fix";
import { removeDirectSession } from "../../workspace-direct-mount/remove-direct-session";
import { sessionPathsFor } from "../../workspace-direct-mount/session-paths";
import type { MountPlan } from "./mount-plan";

/**
 * A DEAD direct row about to be replaced still owns two things on disk: its
 * session directory (a key that stays valid until it expires) and its cache.
 * Saves in that cache upload only through a direct mount on the SAME mount id,
 * so any other replacement is refused while they exist; otherwise the session
 * goes the way `unmount` sends it and the empty cache with it.
 */
export function retireDeadDirectRow(record: MountRecord, replacement: MountPlan): void {
  if (record.engine !== "direct" || record.mountId === undefined) return;
  if (replacement.engine === "direct" && replacement.mountId === record.mountId) return;
  const cacheDir = sessionPathsFor(record.mountId).cacheDir;
  const pendingUploads = countPendingUploads(cacheDir);
  if (pendingUploads > 0) {
    throw failure(
      "local-failed",
      `${describePendingUploads(pendingUploads)} file(s) saved to "${record.slug}" by ${describeOwner(record)}'s previous ` +
        "direct mount have not uploaded yet, and this mount would not upload them.",
      `Run: ${remountFix(record.slug)} under that profile so they upload, or ${discardPendingSavesHint(cacheDir)}.`
    );
  }
  removeDirectSession(record);
}
