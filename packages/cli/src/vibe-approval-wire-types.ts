/**
 * The WIRE SHAPES of a Vibe deployment approval, as the CLI reads them off the
 * approvals endpoints and the deploy trigger.
 *
 * Mirrors `packages/types/src/api/domains/vibe/schemas/approvals.schemas.ts`
 * (full `VibeApprovalRequestSchema` shape — the deploy trigger returns it, and
 * the deploy printer reads a subset), re-declared for the reason
 * `vibe-wire-types.ts` gives: the CLI ships standalone and `@nexus/types` is not
 * a runtime dependency. It is its own module for the reason
 * `vibe-deployment-wire-types.ts` is: `vibe-wire-types.ts` sits on the
 * shrink-only size ledger, and approvals are one cohesive surface.
 * `vibe-wire-types.ts` re-exports every name, so
 * `vibe-wire-types.conformance.ts` still holds each one to the contract.
 *
 * Pure type unions — the CLI never validates these against a string at runtime
 * (status only ever arrives from the server; the decision kind comes from the
 * --approve/--reject flags), so no runtime array is needed.
 */
export type VibeApprovalRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "WITHDRAWN";
export type VibeApprovalDecisionKind = "APPROVE" | "REJECT";

export interface VibeApprovalRequestDto {
  id: string;
  vibeDeploymentId: string;
  organizationId: string;
  status: VibeApprovalRequestStatus;
  requiredApprovals: number;
  expiresAt: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VibeApprovalDecisionDto {
  id: string;
  vibeApprovalRequestId: string;
  organizationId: string;
  decision: VibeApprovalDecisionKind;
  decidedByUserId: string | null;
  note: string | null;
  decidedAt: string;
}

export interface GetApprovalResponse {
  request: VibeApprovalRequestDto;
  decisions: VibeApprovalDecisionDto[];
}

export interface RecordApprovalDecisionResponse {
  request: VibeApprovalRequestDto;
  decision: VibeApprovalDecisionDto;
}

export interface ListPendingApprovalsResponse {
  requests: VibeApprovalRequestDto[];
}
