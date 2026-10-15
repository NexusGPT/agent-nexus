import { failure } from "../errors";
import { discardPendingSavesHint } from "./discard-pending-saves-hint";
import { describePendingUploads } from "./pending-uploads-unknown";

/** How a direct drive would come up read-only over saves that need write access to upload. */
export type ReadOnlyCause = "requested" | "granted";

/**
 * Saves a previous mount left in the cache upload only through a read-write
 * drive on the same cache directory. A read-only drive there — asked for, or
 * all the server would grant — would sit on them forever, so it is refused
 * with the two ways out: let them upload, or discard them knowingly.
 */
export function refusePendingUploadsUnderReadOnly(input: {
  readonly slug: string;
  readonly cacheDir: string;
  readonly pendingUploads: number;
  readonly cause: ReadOnlyCause;
}): void {
  if (input.pendingUploads === 0) return;
  const why =
    input.cause === "requested" ? "--read-only was asked for" : "Nexus now grants read-only access";
  const wayBack = input.cause === "requested" ? "drop --read-only" : "restore write access";
  throw failure(
    "local-failed",
    `${describePendingUploads(input.pendingUploads)} file(s) saved to "${input.slug}" have not uploaded yet, and ${why} — ` +
      "under which they would never upload.",
    `Either ${wayBack} and mount again so they upload, or ${discardPendingSavesHint(input.cacheDir)}.`
  );
}
