import type { RefreshFailureReason } from "./refresh-record";

export type RefreshVerdict =
  /** The last renewal succeeded (or none was needed yet) and the access is still valid. */
  | { readonly kind: "ok"; readonly at: string }
  /** The access has expired and nothing has asked for a renewal since; the next click will. */
  | { readonly kind: "stale"; readonly expiredAt: string }
  /** The last renewal failed; `transient` says whether the next click may succeed on its own. */
  | {
      readonly kind: "failed";
      readonly at: string;
      readonly reason: RefreshFailureReason;
      readonly transient: boolean;
      readonly fix: string;
    }
  /** No renewal can run: a file, a path or the profile the helper needs is gone. */
  | { readonly kind: "broken"; readonly what: string; readonly fix: string };
