import type { RefreshFailureReason } from "./refresh-record";
import type { RefreshVerdict } from "./refresh-verdict";

/** The `refresh` object `status --json` prints for a direct row. */
export interface RefreshJson {
  readonly outcome: RefreshVerdict["kind"];
  readonly at: string | null;
  readonly reason: RefreshFailureReason | null;
  readonly transient: boolean;
  readonly fix: string | null;
}

export function refreshJson(verdict: RefreshVerdict): RefreshJson {
  switch (verdict.kind) {
    case "ok":
      return { outcome: "ok", at: verdict.at, reason: null, transient: false, fix: null };
    case "stale":
      return { outcome: "stale", at: verdict.expiredAt, reason: null, transient: false, fix: null };
    case "failed":
      return {
        outcome: "failed",
        at: verdict.at,
        reason: verdict.reason,
        transient: verdict.transient,
        fix: verdict.fix
      };
    case "broken":
      return { outcome: "broken", at: null, reason: null, transient: false, fix: verdict.fix };
    default:
      return verdict satisfies never;
  }
}
