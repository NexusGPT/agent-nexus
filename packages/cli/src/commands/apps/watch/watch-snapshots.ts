import type { VibeApprovalRequestStatus } from "../../../vibe-approval-wire-types";
import type { VibeDeploymentDisplacerDto } from "../../../vibe-deployment-wire-types";
import type { WatchAppVisibility, WatchEdgeReachability } from "./watch-deployment-status";

export interface WatchDeploymentSnapshot {
  id: string;
  status: string;
  versionNumber: number;
  errorReason: string | null;
  /** The newer deployment, on a DISPLACED row. Absent from a backend a release behind. */
  displacedBy?: VibeDeploymentDisplacerDto | null;
}

export interface WatchAppSnapshot {
  publicUrl: string | null;
  /**
   * Carried so the success line can say who may reach the URL it just printed.
   * Apps are created PRIVATE, so this is the difference between a 401 that
   * means "working as designed" and one that means "broken" — see
   * `print-served-visibility.ts`.
   */
  visibility: WatchAppVisibility;
  edgeReachability: WatchEdgeReachability | null;
  edgeReachabilityAt: string | null;
  edgeReachabilityDetail: string | null;
}

/**
 * The gate on a deployment awaiting review — `null` when it is ungated.
 *
 * WITHDRAWN is deliberately absent from `REFUSED_APPROVALS`: a request is
 * withdrawn only in the transaction that ends its deployment, so the next poll
 * reads that deployment's own terminal status (DISPLACED or FAILED) and exits on
 * it, with the more precise verdict.
 */
export interface WatchApprovalSnapshot {
  status: VibeApprovalRequestStatus;
}
