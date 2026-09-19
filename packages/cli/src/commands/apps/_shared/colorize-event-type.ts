import { color } from "../../../output";
import { type VibeAuditEventType } from "../../../vibe-audit-event-types.generated";

/** How an event reads at a glance, driving only its colour in the table. */
export type AuditEventTone = "failure" | "warning" | "success" | "neutral";

/**
 * Every event type's tone. A `Record` rather than an if/else chain on
 * purpose: adding a member to the Prisma enum regenerates
 * `VIBE_AUDIT_EVENT_TYPES`, and this map then fails to typecheck until
 * somebody classifies the new event.
 *
 * That is the same discipline the `--type` list now has, applied to the
 * other half of the surface. A fallthrough default would have let a new
 * failure event print in the same neutral grey as a routine one — legible,
 * plausible, and wrong in the direction that hides an incident.
 */
export const AUDIT_EVENT_TONE: Record<VibeAuditEventType, AuditEventTone> = {
  DEPLOYMENT_TRIGGERED: "neutral",
  DEPLOYMENT_APPROVED: "success",
  DEPLOYMENT_REJECTED: "warning",
  APPROVAL_EXPIRED: "warning",
  COST_SAFETY_AUTO_SUSPENDED: "failure",
  COST_SAFETY_SOFT_LIMIT_WARNING: "warning",
  COST_SAFETY_MANUALLY_SUSPENDED: "failure",
  COST_SAFETY_MANUALLY_WARNED: "warning",
  COST_SAFETY_MANUALLY_RESUMED: "success",
  COST_SAFETY_SOFT_LIMIT_CLEARED: "success",
  DEPLOYMENT_ROLLED_BACK_COST_SAFETY: "failure",
  BUILD_JOB_SUCCEEDED: "success",
  DEPLOYMENT_BUILD_SUCCEEDED: "success",
  BUILD_JOB_FAILED: "failure",
  DEPLOYMENT_FAILED: "failure",
  BUILD_JOB_TIMED_OUT: "failure",
  DEPLOYMENT_HEALTHY: "success",
  DEPLOYMENT_ROLLED_BACK_HEALTH_CHECK: "failure",
  DEPLOYMENT_SUPERSEDED: "neutral",
  DEPLOYMENT_DISPLACED: "neutral",
  DEPLOYMENT_ROLLED_BACK_USER: "warning",
  // Failure, where the USER rollback above is only a warning. That one is a
  // person deciding to go back; this one is a version that was serving real
  // traffic and started crashing. Same word in the name, opposite urgency.
  DEPLOYMENT_ROLLED_BACK_CRASH_LOOP: "failure",
  // Failure for the same reason as the crash loop above: a version that was
  // serving real traffic was pulled back out of it. The cause differs — the app
  // answered, it just answered wrongly — but what an operator has to do about it
  // does not.
  DEPLOYMENT_ROLLED_BACK_FAILED_SMOKE: "failure",
  SECRET_VALUE_STAGED: "neutral",
  SECRET_VALUE_WRITTEN: "neutral",
  CAPACITY_REQUESTED: "neutral",
  CAPACITY_APPROVED: "success",
  CAPACITY_REJECTED: "warning",
  CAPACITY_EXPIRED: "warning",
  CAPACITY_GROWN: "success",
  APP_EDGE_UNROUTED: "failure",
  GIT_PUSH_NO_DEPLOY: "neutral",
  DEPLOYMENT_SERVED: "success",
  DEPLOYMENT_VERIFICATION_REFUSED: "failure",
  DEPLOYMENT_VERIFICATION_OVERRIDDEN: "warning",
  DEPLOYMENT_VERIFICATION_WARNED: "warning",
  // The access-card lifecycle. Delegating a credential is WARNING, not success:
  // it is a correct, routine action and it is also the row an owner scanning
  // "what can act as me?" has to find, which green would hide. Revoking is the
  // good outcome on this surface, so it takes the green — it answers "did
  // anyone actually take this back?". A pause is neutral because it is
  // reversible and routinely automatic; red would put a nightly quota trip in
  // the same colour as a revocation.
  CARD_GRANT_ISSUED: "warning",
  CARD_GRANT_PAUSED: "neutral",
  CARD_GRANT_ACTIVATED: "neutral",
  CARD_GRANT_REVOKED: "success",
  CARD_BINDING_RENAMED: "neutral",
  CARD_BINDING_REMOVED: "neutral"
};

export function colorizeEventType(t: VibeAuditEventType): string {
  switch (AUDIT_EVENT_TONE[t]) {
    case "failure":
      return color.red(t);
    case "warning":
      return color.yellow(t);
    case "success":
      return color.green(t);
    case "neutral":
      return t;
  }
}
