/**
 * Compile-time conformance of the CLI's audit-feed wire types to the contract
 * (`ListAuditEvents`): the payloads the CLI renders field by field, the event
 * type list the payload union must stay inside, and the unlisted arm the
 * printer asks about first.
 *
 * Unreachable from `src/index.ts`, like every `*.conformance.ts`, so its
 * `@nexus/types` import never reaches `dist/`.
 */

import type {
  VibeAuditEventListedReadPayload,
  VibeAuditMalformedEventReadPayload,
  VibeAuditUnlistedEventReadPayload
} from "@nexus/types";

import { VIBE_AUDIT_EVENT_TYPES } from "./vibe-audit-event-types.generated";
import type { WireAuditPayload } from "./vibe-audit-payload-wire-types.conformance";
import type {
  AuditPayloadMalformed,
  AuditPayloadUnlisted,
  ListAuditEventsResponse,
  VibeAuditEvent
} from "./vibe-audit-wire-types";
import { type VibeData } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

// ============================================================
// Audit feed
// ============================================================

const _auditEvent: Mirrors<
  "VibeAuditEvent",
  Omit<VibeAuditEvent, "payload">,
  Omit<VibeData<"ListAuditEvents">["events"][number], "payload">
> = AGREES;

const _listAuditEvents: Mirrors<
  "ListAuditEventsResponse",
  Omit<ListAuditEventsResponse, "events">,
  Omit<VibeData<"ListAuditEvents">, "events">
> = AGREES;

/**
 * The generated event-type list covers every arm the payload union can carry.
 *
 * A SECOND drift axis, independent of the shapes above:
 * `vibe-audit-event-types.test.ts` proves the generated list matches the Prisma
 * enum, and this proves the payload union matches the same list. Between them,
 * an event type cannot exist that `--type` refuses to filter for or that
 * `AuditPayloadUnmodelled` fails to admit.
 */
const _auditDiscriminants: [
  Exclude<VibeAuditEventListedReadPayload["eventType"], (typeof VIBE_AUDIT_EVENT_TYPES)[number]>
] extends [never]
  ? true
  : [
      "the audit payload union carries an event type the generated list does not:",
      Exclude<VibeAuditEventListedReadPayload["eventType"], (typeof VIBE_AUDIT_EVENT_TYPES)[number]>
    ] = true;

/**
 * The event the contract reads instead of failing the page: an event type this
 * contract has no branch for, kept as the server's word with every field it
 * wrote. The CLI's twin is `AuditPayloadUnlisted`, which the printer asks about
 * first. Both are open-ended, so the question is assignability rather than
 * field-for-field agreement: everything the contract reads as unlisted must be a
 * value the CLI's type admits. (`Mirrors` compares `keyof`, and an index
 * signature's `keyof` differs between an interface and a mapped type.)
 */
const _auditUnlisted: [Wire<VibeAuditUnlistedEventReadPayload>] extends [AuditPayloadUnlisted]
  ? true
  : ["AuditPayloadUnlisted does not admit every payload the contract reads as unlisted"] = true;

/**
 * A row whose stored payload did not fit its own branch: the contract sends its
 * event type, the stored payload and the refused paths rather than dropping it.
 * Everything the contract reads as malformed must be a value the CLI's
 * `AuditPayloadMalformed` admits.
 */
const _auditMalformed: [Wire<VibeAuditMalformedEventReadPayload>] extends [AuditPayloadMalformed]
  ? true
  : ["AuditPayloadMalformed does not admit every payload the contract reads as malformed"] = true;

/**
 * The wire payload is EXACTLY its listed branches, the unlisted arm and the
 * malformed arm: an arm the contract grew that is none of them would reach the
 * CLI as none of them.
 */
const _auditPayloadHalves: [
  Exclude<
    WireAuditPayload,
    | VibeAuditEventListedReadPayload
    | VibeAuditUnlistedEventReadPayload
    | VibeAuditMalformedEventReadPayload
  >
] extends [never]
  ? true
  : ["the audit payload has an arm that is neither listed, unlisted nor malformed"] = true;

export const VIBE_AUDIT_WIRE_TYPES_CONFORM = [
  _auditEvent,
  _listAuditEvents,
  _auditDiscriminants,
  _auditUnlisted,
  _auditMalformed,
  _auditPayloadHalves
] as const;
