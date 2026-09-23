import type { FailureCause } from "../errors";

export const REFRESH_OUTCOMES = ["ok", "failed"] as const;
export type RefreshOutcome = (typeof REFRESH_OUTCOMES)[number];

/**
 * Why a refresh failed. A CLOSED union: the CLI's own failure vocabulary plus
 * the two refusals the helper makes on a mint that SUCCEEDED but must not be
 * served — a lower grade than the mount was made with, or a different
 * workspace behind the same slug.
 */
export type RefreshFailureReason = FailureCause | "access-downgraded" | "workspace-replaced";

/** A refresh that failed always says why; one that succeeded has nothing to add. */
export type RefreshRecord =
  | { readonly at: string; readonly outcome: "ok" }
  | { readonly at: string; readonly outcome: "failed"; readonly reason: RefreshFailureReason };

export type FailedRefresh = Extract<RefreshRecord, { outcome: "failed" }>;
