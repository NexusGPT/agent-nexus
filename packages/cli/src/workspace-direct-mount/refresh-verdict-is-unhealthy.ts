import type { RefreshVerdict } from "./refresh-verdict";

/**
 * True when `status` must exit non-zero over this row: the next click cannot
 * heal it. A transient failure (offline, a slow backend) is printed and left
 * at exit 0, because the next click may well succeed.
 */
export function refreshVerdictIsUnhealthy(verdict: RefreshVerdict): boolean {
  switch (verdict.kind) {
    case "broken":
      return true;
    case "failed":
      return !verdict.transient;
    case "ok":
    case "stale":
      return false;
    default:
      return verdict satisfies never;
  }
}
