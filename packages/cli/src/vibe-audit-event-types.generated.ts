// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: packages/prisma-db/schema.prisma, enum VibeAuditEventType.
// Regenerate: pnpm --filter @agent-nexus/cli run gen:audit-types
//
// `vibe-audit-event-types.test.ts` fails when this file drifts from the
// schema, so a new event type cannot ship with the CLI still refusing it.

/**
 * Every event type the Vibe audit feed can emit — the allowed values of
 * `nexus vibe audit list --type`.
 *
 * In schema declaration order, which groups by lifecycle (trigger, build,
 * deploy, capacity) rather than alphabetically.
 */
export const VIBE_AUDIT_EVENT_TYPES = [
  "DEPLOYMENT_TRIGGERED",
  "DEPLOYMENT_APPROVED",
  "DEPLOYMENT_REJECTED",
  "APPROVAL_EXPIRED",
  "COST_SAFETY_AUTO_SUSPENDED",
  "COST_SAFETY_SOFT_LIMIT_WARNING",
  "COST_SAFETY_MANUALLY_SUSPENDED",
  "COST_SAFETY_MANUALLY_WARNED",
  "COST_SAFETY_MANUALLY_RESUMED",
  "COST_SAFETY_SOFT_LIMIT_CLEARED",
  "DEPLOYMENT_ROLLED_BACK_COST_SAFETY",
  "BUILD_JOB_SUCCEEDED",
  "DEPLOYMENT_BUILD_SUCCEEDED",
  "BUILD_JOB_FAILED",
  "DEPLOYMENT_FAILED",
  "BUILD_JOB_TIMED_OUT",
  "DEPLOYMENT_HEALTHY",
  "DEPLOYMENT_ROLLED_BACK_HEALTH_CHECK",
  "DEPLOYMENT_SUPERSEDED",
  "DEPLOYMENT_DISPLACED",
  "DEPLOYMENT_ROLLED_BACK_USER",
  "SECRET_VALUE_STAGED",
  "SECRET_VALUE_WRITTEN",
  "CAPACITY_REQUESTED",
  "CAPACITY_APPROVED",
  "CAPACITY_REJECTED",
  "CAPACITY_EXPIRED",
  "CAPACITY_GROWN",
  "APP_EDGE_UNROUTED",
  "GIT_PUSH_NO_DEPLOY",
  "DEPLOYMENT_SERVED",
  "DEPLOYMENT_VERIFICATION_REFUSED",
  "DEPLOYMENT_VERIFICATION_OVERRIDDEN",
  "DEPLOYMENT_VERIFICATION_WARNED"
] as const;

export type VibeAuditEventType = (typeof VIBE_AUDIT_EVENT_TYPES)[number];
