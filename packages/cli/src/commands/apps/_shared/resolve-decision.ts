import { type VibeApprovalDecisionKind } from "../../../vibe-approval-wire-types";

/**
 * Resolve the mutually-exclusive --approve / --reject flags to the wire
 * decision kind. Exactly one is required — reject zero or both locally
 * before the round-trip.
 */
export function resolveDecision(cmdOpts: {
  approve?: boolean;
  reject?: boolean;
}): VibeApprovalDecisionKind {
  if (cmdOpts.approve && cmdOpts.reject) {
    throw new Error("Pass only one of --approve / --reject, not both.");
  }
  if (cmdOpts.approve) return "APPROVE";
  if (cmdOpts.reject) return "REJECT";
  throw new Error("A decision is required. Pass --approve or --reject.");
}
