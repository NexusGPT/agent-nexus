/**
 * THE DRIFT GATE for `vibe-approval-wire-types.ts`.
 *
 * Same mechanism, same vocabulary as `vibe-wire-types.conformance.ts`: every
 * assertion is a `const` whose declared type is `true` only while the CLI's
 * hand-declared shape matches the endpoint contract, so `pnpm typecheck` fails
 * — naming the field — the day one of them drifts. Compiled, never executed,
 * and unreachable from `src/index.ts`.
 */

/**
 * The whole module as a TYPE namespace, so the contract's vocabularies can be
 * read in type position without importing a value — the bundle gate admits
 * `@nexus/types` here and nowhere a published module can reach.
 */
import type * as NexusTypes from "@nexus/types";

import type {
  GetApprovalResponse,
  ListPendingApprovalsResponse,
  RecordApprovalDecisionResponse,
  VibeApprovalDecisionDto,
  VibeApprovalDecisionKind,
  VibeApprovalRequestDto,
  VibeApprovalRequestStatus
} from "./vibe-approval-wire-types";
import {
  AGREES,
  type Mirrors,
  type SameMembers,
  type VibeData
} from "./vibe-wire-vocabulary.conformance";

const _approvalRequest: Mirrors<
  "VibeApprovalRequestDto",
  VibeApprovalRequestDto,
  VibeData<"GetApprovalRequest">["request"]
> = AGREES;

const _approvalDecision: Mirrors<
  "VibeApprovalDecisionDto",
  VibeApprovalDecisionDto,
  VibeData<"GetApprovalRequest">["decisions"][number]
> = AGREES;

const _getApproval: Mirrors<
  "GetApprovalResponse",
  GetApprovalResponse,
  VibeData<"GetApprovalRequest">
> = AGREES;

const _recordDecision: Mirrors<
  "RecordApprovalDecisionResponse",
  RecordApprovalDecisionResponse,
  VibeData<"RecordApprovalDecision">
> = AGREES;

/**
 * The pending queue extends the request with deployment context the CLI does
 * not print — the queue is a list of ids to act on, and `approvals get <id>`
 * is the command that expands one.
 */
type WirePendingItem = VibeData<"ListPendingApprovals">["requests"][number];

const _listPending: Mirrors<
  "ListPendingApprovalsResponse.requests[]",
  ListPendingApprovalsResponse["requests"][number],
  WirePendingItem,
  "deployment"
> = AGREES;

/**
 * The two vocabularies the CLI declares as bare unions. A shape comparison reads a
 * status field through its union, but the unions themselves are the CLI's own
 * `watch` and `--approve/--reject` vocabulary, so their MEMBERSHIP is asserted:
 * a status added upstream fails here instead of printing unrecognised.
 */
const _requestStatuses: SameMembers<
  "VibeApprovalRequestStatus",
  VibeApprovalRequestStatus,
  NexusTypes.VibeApprovalRequestStatusValue
> = true;

const _decisionKinds: SameMembers<
  "VibeApprovalDecisionKind",
  VibeApprovalDecisionKind,
  NexusTypes.VibeApprovalDecisionKindValue
> = true;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist.
 */
export const VIBE_APPROVAL_WIRE_TYPES_CONFORM = [
  _approvalRequest,
  _approvalDecision,
  _getApproval,
  _recordDecision,
  _listPending,
  _requestStatuses,
  _decisionKinds
] as const;
