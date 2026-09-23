import { color } from "../../output";
import { describePendingUploads } from "../../workspace-direct-mount/pending-uploads-unknown";

/** Saves a previous mount left behind, now queued on the same cache directory. */
export function printPendingUploads(count: number | null): void {
  if (count === null || count === 0) return;
  console.log(
    color.dim(
      `  ${describePendingUploads(count)} file(s) saved before the previous mount ended are uploading now.`
    )
  );
}
