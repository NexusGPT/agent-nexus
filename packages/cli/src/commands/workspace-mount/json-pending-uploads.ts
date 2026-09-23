import { PENDING_UPLOADS_UNKNOWN } from "../../workspace-direct-mount/pending-uploads-unknown";

/**
 * The `pendingUploads` a `--json` document carries.
 *
 * 🔴 THREE ANSWERS, AND `null` ALREADY MEANS ONE OF THEM. The help defines it as
 * "null on other engines" — nothing to lose. `PENDING_UPLOADS_UNKNOWN` is
 * infinite so both in-process comparisons fail safe, but `JSON.stringify`
 * renders infinity as `null`, which lands the cache we could NOT read on top of
 * the value meaning there is nothing there — the exact conflation the sentinel
 * exists to prevent, one serialisation away. It goes out as the string
 * `"unknown"` instead, which no numeric comparison can mistake for zero.
 */
export function jsonPendingUploads(count: number | null | undefined): number | "unknown" | null {
  if (count === undefined || count === null) return null;
  return count === PENDING_UPLOADS_UNKNOWN ? "unknown" : count;
}
