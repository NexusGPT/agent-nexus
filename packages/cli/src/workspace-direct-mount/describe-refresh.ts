import { formatAgo } from "./format-ago";
import { REFRESH_FAILURE_TABLE } from "./refresh-failure-table";
import type { RefreshVerdict } from "./refresh-verdict";

/**
 * The Refresh column: exactly one of four shapes. `live` is the row's own
 * liveness — a stale session refreshes on the next access only while there is
 * a process to access it through.
 */
export function describeRefresh(verdict: RefreshVerdict, now: Date, live: boolean): string {
  switch (verdict.kind) {
    case "ok":
      return `ok ${formatAgo(verdict.at, now)}`;
    case "stale": {
      const then = live ? "refreshes on next access" : "mount is not live — remount";
      return `stale: expired ${formatAgo(verdict.expiredAt, now)}, ${then}`;
    }
    case "failed":
      return `failed ${formatAgo(verdict.at, now)}: ${REFRESH_FAILURE_TABLE[verdict.reason].title} — ${verdict.fix}`;
    case "broken":
      return `broken: ${verdict.what} — run: ${verdict.fix}`;
    default:
      return verdict satisfies never;
  }
}
