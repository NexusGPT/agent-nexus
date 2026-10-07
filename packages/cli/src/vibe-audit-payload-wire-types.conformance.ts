/**
 * Compile-time conformance of the CLI's audit payload interfaces — the ones it
 * renders field by field — to the contract's read branches. Each arm compares
 * one CLI interface with the wire branch of the same event type.
 *
 * Unreachable from `src/index.ts`, like every `*.conformance.ts`.
 */

import type { VibeAuditEventListedReadPayload } from "@nexus/types";

import type {
  AuditPayloadApprovalDecision,
  AuditPayloadApprovalExpired,
  AuditPayloadCostSafetyAutoSuspended,
  AuditPayloadDeploymentRolledBack,
  AuditPayloadDeploymentServed,
  AuditPayloadDeploymentTriggered
} from "./vibe-audit-payload-wire-types";
import { type VibeData } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

export type WireAuditPayload = VibeData<"ListAuditEvents">["events"][number]["payload"];
/**
 * One LISTED branch of the contract's read payload, as it arrives on the wire.
 * Taken from the listed half directly — every arm below names an event type the
 * contract has a branch for, so the unlisted arm is no candidate for any of them.
 */
type WireAuditArm<E extends string> = Extract<
  Wire<VibeAuditEventListedReadPayload>,
  { eventType: E }
>;

/**
 * The payloads the CLI renders field by field. Every other event type is
 * printed generically by `formatUnmodelledDetails` and is covered by
 * `_auditDiscriminants` in `vibe-audit-wire-types.conformance.ts` instead — an
 * interface each would be declarations no reader consults and no code narrows
 * on. No count is written here: the feed gains event types with the schema, and
 * `VIBE_AUDIT_EVENT_TYPES` is the list.
 */
const _auditTriggered: Mirrors<
  "AuditPayloadDeploymentTriggered",
  AuditPayloadDeploymentTriggered,
  WireAuditArm<"DEPLOYMENT_TRIGGERED">
> = AGREES;

/**
 * One CLI interface covers both approval outcomes, so it is compared against BOTH wire
 * arms at once rather than each in turn.
 * `Extract<AuditPayloadApprovalDecision, { eventType: "DEPLOYMENT_APPROVED" }>` yields
 * `never` here (the CLI's discriminant is the two-literal union, which is not assignable
 * to one of them), and a `never` on either side satisfies every assertion in `Mirrors`.
 * The two wire arms carry identical keys, so `keyof` over the pair is the same set.
 */
const _auditApprovalDecision: Mirrors<
  "AuditPayloadApprovalDecision",
  AuditPayloadApprovalDecision,
  WireAuditArm<"DEPLOYMENT_APPROVED"> | WireAuditArm<"DEPLOYMENT_REJECTED">
> = AGREES;

/** Guards the pair above against the vacuous case: both arms must exist on the wire. */
const _auditApprovalArmsNonEmpty: [
  [WireAuditArm<"DEPLOYMENT_APPROVED">] extends [never]
    ? ["the wire audit union has no DEPLOYMENT_APPROVED arm — the check above is vacuous"]
    : true,
  [WireAuditArm<"DEPLOYMENT_REJECTED">] extends [never]
    ? ["the wire audit union has no DEPLOYMENT_REJECTED arm — the check above is vacuous"]
    : true
] = [true, true];

const _auditExpired: Mirrors<
  "AuditPayloadApprovalExpired",
  AuditPayloadApprovalExpired,
  WireAuditArm<"APPROVAL_EXPIRED">
> = AGREES;

const _auditSuspended: Mirrors<
  "AuditPayloadCostSafetyAutoSuspended",
  AuditPayloadCostSafetyAutoSuspended,
  WireAuditArm<"COST_SAFETY_AUTO_SUSPENDED">
> = AGREES;

const _auditRolledBack: Mirrors<
  "AuditPayloadDeploymentRolledBack",
  AuditPayloadDeploymentRolledBack,
  WireAuditArm<"DEPLOYMENT_ROLLED_BACK_COST_SAFETY">
> = AGREES;

const _auditServed: Mirrors<
  "AuditPayloadDeploymentServed",
  AuditPayloadDeploymentServed,
  WireAuditArm<"DEPLOYMENT_SERVED">
> = AGREES;

export const VIBE_AUDIT_PAYLOAD_WIRE_TYPES_CONFORM = [
  _auditTriggered,
  _auditApprovalDecision,
  _auditApprovalArmsNonEmpty,
  _auditExpired,
  _auditSuspended,
  _auditRolledBack,
  _auditServed
] as const;
