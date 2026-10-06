import type { VibeUnlistedValue } from "./vibe-deploy-state-vocabulary";

// ============================================================
// Audit feed — the payloads the CLI renders field by field. Mirrors the
// branches of `VibeAuditEventReadPayloadSchema`; held to them by
// `vibe-wire-types.conformance.ts`.
// ============================================================

export interface AuditPayloadDeploymentTriggered {
  eventType: "DEPLOYMENT_TRIGGERED";
  vibeDeploymentId: string;
  triggerSha: string;
  approvalGated: boolean;
  /**
   * What kicked the deploy off. Optional on the wire and therefore here: rows
   * written before the field existed carry no source, and absent means "predates
   * the field", never "unknown source".
   *
   * A plain string, like every enum the CLI only prints: a newer backend may
   * write a source this binary does not list, and the feed's contract reads it
   * as the server's own word (`VibeAuditEventReadPayloadSchema`).
   */
  triggerSource?: string;
}
export interface AuditPayloadApprovalDecision {
  eventType: "DEPLOYMENT_APPROVED" | "DEPLOYMENT_REJECTED";
  vibeApprovalRequestId: string;
  vibeDeploymentId: string;
  deciderUserId: string;
  decisive: boolean;
  note: string | null;
}
export interface AuditPayloadApprovalExpired {
  eventType: "APPROVAL_EXPIRED";
  vibeApprovalRequestId: string;
  vibeDeploymentId: string;
}
export interface AuditPayloadCostSafetyAutoSuspended {
  eventType: "COST_SAFETY_AUTO_SUSPENDED";
  /**
   * `VIBE_BACKUP_MIN` was missing here while the wire enum has carried four
   * values. A suspension on backup minutes would have arrived as a value this
   * union says is impossible — the CLI still prints it, because nothing
   * validates at runtime, but any narrowing written against these three would
   * have silently dropped the one event that says why an app stopped.
   */
  usageType:
    | "VIBE_COMPUTE_MIN"
    | "VIBE_BUILD_MIN"
    | "VIBE_EGRESS_MB"
    | "VIBE_BACKUP_MIN"
    | VibeUnlistedValue;
  breachedSum: number;
  effectiveCap: number;
  billingPeriod: string;
}
export interface AuditPayloadDeploymentRolledBack {
  eventType: "DEPLOYMENT_ROLLED_BACK_COST_SAFETY";
  vibeDeploymentId: string;
  priorStatus: "BUILDING" | "AWAITING_APPROVAL" | "DEPLOYING" | "HEALTHY" | VibeUnlistedValue;
  triggerSha: string;
  suspendedReason: string | null;
}

/**
 * The terminal "it is actually live" — written when the app's public URL was
 * observed answering FROM this deployment.
 *
 * `DEPLOYMENT_HEALTHY` does not mean that and cannot: it is the allocation's
 * verdict and lands before the edge swaps content, by up to whole minutes. This
 * is the event to poll for after a `nexus vibe deploy`; polling HEALTHY reads
 * the previous build and looks like the wrong code shipped.
 */
export interface AuditPayloadDeploymentServed {
  eventType: "DEPLOYMENT_SERVED";
  vibeDeploymentId: string;
  triggerSha: string;
  imageRef: string;
  color: "BLUE" | "GREEN" | VibeUnlistedValue;
  /// Milliseconds from the healthy flip to this observation. An UPPER bound —
  /// the probe samples on a tick, so it notices the swap some time after it
  /// happened.
  healthyToServedMs: number;
}

/** The event types this file declares a payload interface for. */
export type ModelledAuditPayload =
  | AuditPayloadDeploymentTriggered
  | AuditPayloadApprovalDecision
  | AuditPayloadApprovalExpired
  | AuditPayloadCostSafetyAutoSuspended
  | AuditPayloadDeploymentRolledBack
  | AuditPayloadDeploymentServed;
