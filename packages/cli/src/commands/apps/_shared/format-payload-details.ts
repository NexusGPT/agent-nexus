import { color } from "../../../output";
import { type AuditPayload, type AuditPayloadUnmodelled } from "../../../vibe-wire-types";
import { shortenId } from "./shorten-id";
import { truncate } from "./truncate";

/**
 * Per-event-type "details" column. Picks the field set that most
 * directly answers "what should I look at first?" for each event:
 *   - DEPLOYMENT_TRIGGERED → sha + gated marker
 *   - DEPLOYMENT_APPROVED/REJECTED → decider + decisive flag + note
 *   - APPROVAL_EXPIRED → request id
 *   - COST_SAFETY_AUTO_SUSPENDED → usageType + breachedSum/cap + period
 *   - DEPLOYMENT_ROLLED_BACK_COST_SAFETY → priorStatus + reason
 *
 * Every other event type falls to `formatUnmodelledDetails`, which renders
 * the fields it recognises generically. The `default` arm is what makes the
 * column honest: the feed emits 34 types and this file names 7, so before it
 * existed a DEPLOYMENT_FAILED row printed the literal string `undefined`
 * where its reason belonged.
 */
export function formatPayloadDetails(payload: AuditPayload): string {
  switch (payload.eventType) {
    case "DEPLOYMENT_TRIGGERED": {
      const sha = payload.triggerSha.slice(0, 7);
      const gate = payload.approvalGated ? color.yellow("gated") : color.dim("ungated");
      return `sha=${sha} ${gate}`;
    }
    case "DEPLOYMENT_APPROVED":
    case "DEPLOYMENT_REJECTED": {
      const decider = shortenId(payload.deciderUserId);
      const decisive = payload.decisive ? "decisive" : color.dim("non-decisive");
      const note = payload.note ? ` note="${truncate(payload.note, 40)}"` : "";
      return `decider=${decider} ${decisive}${note}`;
    }
    case "APPROVAL_EXPIRED":
      return `request=${shortenId(payload.vibeApprovalRequestId)}`;
    case "COST_SAFETY_AUTO_SUSPENDED":
      return `${payload.usageType} sum=${payload.breachedSum} cap=${payload.effectiveCap} period=${payload.billingPeriod}`;
    case "DEPLOYMENT_ROLLED_BACK_COST_SAFETY": {
      const reason = payload.suspendedReason
        ? ` reason="${truncate(payload.suspendedReason, 40)}"`
        : "";
      return `prior=${payload.priorStatus}${reason}`;
    }
    case "DEPLOYMENT_SERVED": {
      const sha = payload.triggerSha.slice(0, 7);
      // The lag is the whole point of this event, so it is printed even though
      // it is the third field: a reader watching a deploy wants to know how far
      // behind the healthy flip the edge actually was.
      const lag = `+${Math.round(payload.healthyToServedMs / 1000)}s`;
      return `sha=${sha} ${payload.color.toLowerCase()} ${lag}`;
    }
    default:
      return formatUnmodelledDetails(payload);
  }
}

/**
 * The fields worth showing from a payload with no `case` of its own, in the
 * order a reader wants them: what failed, what it was doing, which commit.
 *
 * `errorReason` leads because on the events this most often renders —
 * DEPLOYMENT_FAILED, DEPLOYMENT_ROLLED_BACK_HEALTH_CHECK, BUILD_JOB_FAILED —
 * it is the only field that answers why, and it is the field the operator
 * came to the feed for.
 */
export const UNMODELLED_DETAIL_FIELDS = [
  "errorReason",
  "reason",
  "priorStatus",
  "color",
  "triggerSha"
] as const;

/**
 * Render a payload the CLI does not model field by field.
 *
 * Reaching for `--json` is always the complete answer, and the dim hint says
 * so. What this must not do is print nothing, or print `undefined`: the
 * details column is where a reader scanning `apps audit list` decides whether
 * a row matters, and a blank one on DEPLOYMENT_FAILED reads as "no further
 * information exists" rather than "this printer has no case for it".
 */
export function formatUnmodelledDetails(payload: AuditPayloadUnmodelled): string {
  const parts: string[] = [];
  for (const field of UNMODELLED_DETAIL_FIELDS) {
    const value = payload[field];
    if (typeof value === "number") {
      parts.push(`${field}=${value}`);
      continue;
    }
    if (typeof value !== "string" || value === "") continue;
    // Shas are long, opaque and only ever compared by their prefix; every
    // other field is prose worth reading, so it is truncated rather than cut
    // to a fixed width.
    parts.push(
      field === "triggerSha" ? `sha=${value.slice(0, 7)}` : `${field}="${truncate(value, 48)}"`
    );
  }
  return parts.length === 0 ? color.dim("— use --json") : parts.join(" ");
}
