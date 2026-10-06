import {
  VIBE_AUDIT_EVENT_TYPES,
  type VibeAuditEventType
} from "./vibe-audit-event-types.generated";
import type { ModelledAuditPayload } from "./vibe-audit-payload-wire-types";
import type { VibeUnlistedValue } from "./vibe-deploy-state-vocabulary";

// ============================================================
// Audit feed — mirrors audit-events.schemas.ts.
// ============================================================

export function isAuditEventType(v: string): v is VibeAuditEventType {
  return (VIBE_AUDIT_EVENT_TYPES as readonly string[]).includes(v);
}

/**
 * Every OTHER event type the feed emits — 28 of the 34, at the time of
 * writing — whose payload this file does not mirror field by field.
 *
 * They are not hypothetical and never were: the feed has always returned them
 * and `vibe audit list` has always printed them. Leaving them out of the union
 * did not keep them out of the output, it only left the printer believing its
 * `switch` was exhaustive — so an unmodelled row fell off the end of
 * every `case` and printed the literal string `undefined` in its details
 * column.
 *
 * Modelling them as a rest arm rather than 28 more interfaces is deliberate.
 * The interfaces above exist because their fields are rendered SPECIFICALLY;
 * these are rendered generically by `formatUnmodelledDetails`, so an interface
 * per type would be 28 declarations no reader consults and no code narrows on.
 * Promote one the moment its details column deserves its own `case`.
 */
export interface AuditPayloadUnmodelled {
  eventType: Exclude<VibeAuditEventType, ModelledAuditPayload["eventType"]>;
  [field: string]: unknown;
}

/** Every audit payload this binary has an event type for: field-by-field or generic. */
export type AuditPayload = ModelledAuditPayload | AuditPayloadUnmodelled;

/**
 * An audit event whose TYPE this binary does not list: a backend newer than the
 * binary learned it first. The feed's contract reads it rather than failing the
 * page (`VibeAuditUnlistedEventReadPayloadSchema`), and so does this binary — it
 * prints the server's own event type and fields instead of dropping the row.
 *
 * Kept OUT of {@link AuditPayload}: an arm whose `eventType` is not a literal
 * would stop every `case` in the printer's switch from narrowing. Readers ask
 * {@link isListedAuditPayload} first.
 */
export interface AuditPayloadUnlisted {
  eventType: VibeUnlistedValue;
  [field: string]: unknown;
}

/**
 * An audit row whose stored payload does not fit its own event type's branch. The
 * server sends the row's event type, the stored payload as `raw`, and the paths
 * validation refused, instead of dropping it
 * (`VibeAuditMalformedEventReadPayloadSchema`).
 */
export interface AuditPayloadMalformed {
  eventType: string;
  malformedPayload: { raw: unknown; issuePaths: string[] };
}

/** Every shape the audit feed can carry in `payload`. */
export type AuditFeedPayload = AuditPayload | AuditPayloadUnlisted | AuditPayloadMalformed;

/** True for a row whose stored payload did not fit its event type's branch. */
export function isMalformedAuditPayload(
  payload: AuditFeedPayload
): payload is AuditPayloadMalformed {
  return "malformedPayload" in payload;
}

/**
 * True for a payload whose event type this binary lists AND that is not
 * malformed — the question asked before switching on it. The event type alone is
 * not enough: a malformed row carries a listed type with none of its fields.
 */
export function isListedAuditPayload(payload: AuditFeedPayload): payload is AuditPayload {
  return !isMalformedAuditPayload(payload) && isAuditEventType(payload.eventType);
}

export interface VibeAuditEvent {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  vibeAppId: string | null;
  payload: AuditFeedPayload;
  createdAt: string;
}

export interface ListAuditEventsResponse {
  events: VibeAuditEvent[];
  nextCursor: string | null;
}
