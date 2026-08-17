/**
 * THE DRIFT GATE for `vibe-wire-types.ts`.
 *
 * The CLI is published as a standalone npm package, so `@nexus/types` cannot be
 * a runtime dependency and the Vibe wire shapes are hand-declared. That is safe
 * only while something FAILS when a declaration stops matching the contract it
 * copies. Until this file existed, the only thing asking for lockstep was a
 * comment saying "keep these in lockstep" — and SEVEN shapes had already drifted
 * past it:
 *
 *   · `VibeAppDto` had no `shipGateMode`, `linkedToolId` or `icon`.
 *   · `VibeAppListItemDto` had neither deployment summary, so the CLI's app
 *     list could not say whether an app was serving.
 *   · `VibeAppEnvVarDto` had no `secretMaterial`, the write gate's verdict on a
 *     stored value.
 *   · `AuditPayloadDeploymentTriggered` had no `triggerSource`, the field added
 *     to answer "why did this app deploy twice for one commit".
 *   · `AuditPayloadCostSafetyAutoSuspended`'s `usageType` was missing
 *     `VIBE_BACKUP_MIN`, so a backup-minutes suspension arrived as a value the
 *     union called impossible.
 *   · `SingleVibeGitProjectResponse.repository` was typed as a full project
 *     while the wire declares three of its fields optional.
 *   · `VibeGitProjectDto` was documented as a "subset" and was a full mirror,
 *     which invites a reader to take a future missing field for a choice.
 *
 * Six of the seven broke no command — an unmodelled key is simply not printed,
 * so there was nothing to notice. The seventh printed
 * `git rebase origin/undefined`. That is the failure mode this file closes: it
 * makes the omission a COMPILE ERROR that has to be mirrored or written down.
 *
 * ── How it works ────────────────────────────────────────────────────────────
 *
 * Every assertion is a `const` whose declared type is `true` when the shapes
 * agree and a descriptive TUPLE when they do not, so `pnpm typecheck` prints
 * the offending field names rather than `'false' is not assignable to 'true'`.
 * There is no runtime behaviour here at all; the module exists to be compiled.
 *
 * The comparison target is `TApi[…]["Response"]` — the ENDPOINT contract, not
 * the entity schema behind it. A response is what the CLI actually receives, so
 * a field that exists on an entity but never leaves the server cannot produce a
 * false failure here.
 *
 * ── Why this file cannot reach the published binary ─────────────────────────
 *
 * `src/index.ts` cannot reach this module, so tsup's bundle graph never visits
 * it and the `@nexus/types` import below (which pulls Zod, and transitively the
 * generated Prisma enums) stays out of `dist/`. `vibe-wire-types.test.ts` holds
 * that property as an assertion rather than as this paragraph: it fails if any
 * module the binary CAN reach imports `@nexus/types`.
 */

import type { TApi } from "@nexus/types";
/**
 * The whole module as a TYPE namespace, so `typeof NexusTypes.SOME_CONST` can be
 * read in type position without importing a value. That is what lets this file
 * gate CONSTANTS as well as shapes while staying `import type` throughout — the
 * property `wire-types-bundle.test.ts` asserts for the whole package.
 */
import type * as NexusTypes from "@nexus/types";
import type { TApiPublicV1 } from "@nexus/types/public-api-v1";

import { VIBE_AUDIT_EVENT_TYPES } from "./vibe-audit-event-types.generated";
import type {
  AuditPayloadApprovalDecision,
  AuditPayloadApprovalExpired,
  AuditPayloadCostSafetyAutoSuspended,
  AuditPayloadDeploymentRolledBack,
  AuditPayloadDeploymentServed,
  AuditPayloadDeploymentTriggered,
  CreateVibeAppResponse,
  DeletedIdResponse,
  DeleteEnvVarResponse,
  ExternalToolDetail,
  GetApprovalResponse,
  GetDeploymentResponse,
  GetDeployStateResponse,
  GetEdgeTokenResponse,
  GetGitCredentialsResponse,
  GetVibeAppLogsResponse,
  GetVibeAppResponse,
  ListAuditEventsResponse,
  ListDeploymentsResponse,
  ListEnvVarsResponse,
  ListPendingApprovalsResponse,
  ListVibeAppsResponse,
  ListVibeGitProjectsResponse,
  RecordApprovalDecisionResponse,
  RollbackAppResponse,
  RotateEdgeTokenResponse,
  SetVisibilityResponse,
  SingleVibeAppResponse,
  SingleVibeGitProjectResponse,
  StandaloneVibeGitProjectResponse,
  TriggerDeploymentResponse,
  UpsertEnvVarResponse,
  VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH,
  VIBE_LOG_WIRE_MAX_LIMIT,
  VibeAppCardBindingDto,
  VibeAppDto,
  VibeAppEnvVarDto,
  VibeAppGitProjectSummaryDto,
  VibeAppLogStreamEndReason,
  VibeAppLogStreamFrame,
  VibeApprovalDecisionDto,
  VibeApprovalRequestDto,
  VibeAuditEvent,
  VibeBuildJobDto,
  VibeDeploymentDto,
  VibeDeployStateOutcome,
  VibeEdgeTokenDto,
  VibeGitCredentialsDto,
  VibeGitProjectAliasDto,
  VibeGitProjectDto,
  VibeLiveDeploymentDto,
  VibeLogColor,
  VibeLogLineDto,
  VibeRefDto,
  VibeServedArtifactDto
} from "./vibe-wire-types";

// ============================================================
// The assertion vocabulary
// ============================================================

/**
 * A contract type as it arrives over the wire.
 *
 * `z.infer` describes the value AFTER parsing, where `z.coerce.date()` has
 * already produced a `Date`. The CLI never runs the schema — it reads the raw
 * JSON body — so every such field is an ISO string on its side. Normalising
 * `Date → string` here is the one difference that is correct rather than drift;
 * without it every timestamp on every shape would report a false failure and
 * the gate would be switched off within a week.
 */
type Wire<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

/** The response body of a tenant Vibe endpoint, unwrapped from its envelope. */
type VibeData<Op extends keyof TApi["Vibe"]> = Wire<
  TApi["Vibe"][Op]["Response"] extends { data: infer D } ? D : never
>;

/** Wire fields the CLI type does not declare. */
type Omitted<Cli, W> = Exclude<keyof W, keyof Cli>;

/**
 * A CLI field with no counterpart on the wire — ALWAYS a defect, never a
 * deliberate choice: the CLI cannot receive a key the server does not send, so
 * anything here is a field that was renamed or removed upstream and is now read
 * as `undefined` at runtime.
 */
type NoInventedFields<Label extends string, Cli, W> = [Exclude<keyof Cli, keyof W>] extends [never]
  ? true
  : [Label, "declares a field the wire contract does not have:", Exclude<keyof Cli, keyof W>];

/**
 * The CLI omits EXACTLY the wire fields named in `Declared`, no more and no
 * fewer.
 *
 * Both directions matter. A NEW wire field the CLI ignores fails until someone
 * mirrors it or writes its name here with a reason — which is the whole point,
 * because ignoring a field is a decision and a decision should be visible. A
 * declared omission that no longer exists fails too, so this list cannot rot
 * into a set of names nobody can explain.
 */
type OmitsExactly<Label extends string, Cli, W, Declared> = [
  Exclude<Omitted<Cli, W>, Declared>
] extends [never]
  ? [Exclude<Declared, Omitted<Cli, W>>] extends [never]
    ? true
    : [Label, "declares an omission that is not missing:", Exclude<Declared, Omitted<Cli, W>>]
  : [Label, "silently omits a wire field:", Exclude<Omitted<Cli, W>, Declared>];

/**
 * Every field the two DO share carries a type the wire value satisfies.
 *
 * Assignability rather than equality, and in that direction on purpose: the CLI
 * may hold a field more loosely than the contract does (`status: string` for a
 * server enum is a deliberate, harmless widening, and it keeps a published
 * binary from rejecting a value a newer backend adds). It may never hold one
 * more tightly, because that is the shape that reads a real response as the
 * wrong type.
 */
type SharedFieldsMatch<Label extends string, Cli, W> =
  Pick<W, Extract<keyof Cli, keyof W>> extends Pick<Cli, Extract<keyof Cli, keyof W>>
    ? true
    : [Label, "narrows or mistypes a field it shares with the wire contract"];

/**
 * The three assertions every mirrored shape gets. `Declared` omissions default to none.
 *
 * `readonly`, because {@link AGREES} is a `as const` tuple and a readonly tuple is not
 * assignable to a mutable one — without this every assertion below fails for a reason
 * that has nothing to do with the shapes it is checking.
 */
type Mirrors<Label extends string, Cli, W, Declared = never> = readonly [
  NoInventedFields<Label, Cli, W>,
  OmitsExactly<Label, Cli, W, Declared>,
  SharedFieldsMatch<Label, Cli, W>
];

/** Satisfied by a `Mirrors<…>` tuple only when all three of its members are `true`. */
const AGREES = [true, true, true] as const;

/**
 * Two unions of literals hold EXACTLY the same members.
 *
 * For enum-shaped things a shape comparison says nothing — every member is a
 * `string` — so the membership itself is what has to be asserted. Both
 * directions: a member added upstream must fail here (the CLI would receive a
 * value its own union calls impossible), and a member the CLI still lists after
 * upstream dropped it must fail too, or the list rots into names nobody can
 * explain. Same argument as `OmitsExactly`, one level down.
 */
type SameMembers<Label extends string, Cli, Wire> = [Exclude<Wire, Cli>] extends [never]
  ? [Exclude<Cli, Wire>] extends [never]
    ? true
    : [Label, "declares a member the contract does not have:", Exclude<Cli, Wire>]
  : [Label, "is missing a member the contract has:", Exclude<Wire, Cli>];

/**
 * Two literal types are the same literal.
 *
 * Bidirectional deliberately. `512 extends number` is true, so a ONE-way check
 * would keep passing on the day the upstream constant stops being a literal —
 * i.e. it would go vacuous exactly when it stopped being able to see anything.
 * Failing loudly there is correct: it says the gate can no longer bind, which is
 * a thing to know rather than a thing to be quietly deprived of.
 */
type SameLiteral<Label extends string, Cli, Wire> = [Cli] extends [Wire]
  ? [Wire] extends [Cli]
    ? true
    : [Label, "is narrower than the contract's constant — the gate cannot bind", Cli, Wire]
  : [Label, "does not equal the contract's constant", Cli, Wire];

// ============================================================
// Apps
// ============================================================

type WireApp = VibeData<"GetApp">["app"];

/**
 * `icon` is console-facing and has no CLI rendering: it is an image the terminal
 * cannot draw. `linkedToolId` is reachable as the whole tool via
 * `app register-as-tool`, which prints the tool itself rather than its id.
 *
 * `shipGateMode` IS MIRRORED, and the argument for omitting it was wrong in a
 * way worth stating once: "the gate is applied server-side, so printing the mode
 * would invite a reader to treat the CLI as the place it is decided". The CLI
 * was already printing a `Ship gate` row off `requireVerification` — the mode's
 * LOSSY boolean projection — so the omission did not keep the gate off this
 * surface. It only made the surface wrong: `WARN` projects to `false`, so a
 * guarded app printed `Ship gate: off` while every one of its deploys recorded a
 * finding. A field that a table already renders a projection of is not omitted;
 * it is misread.
 */
const _app: Mirrors<"VibeAppDto", VibeAppDto, WireApp, "icon" | "linkedToolId"> = AGREES;

/**
 * The list read carries two deployment summaries the CLI does not render — see
 * `VibeAppListItemDto`, which documents why `vibe deployments list` is the
 * command that answers "is it serving".
 *
 * `shipGateMode` is NOT omitted here, because `VibeAppListItemDto` is
 * `VibeAppDto & VibeAppEnvelopeExtras` and inherits it. The list table still
 * prints no gate column — mirroring a field is not rendering it — but the
 * omission line had to go, and this gate is what said so rather than a reader.
 *
 * `createdBy` is the creator SUMMARY the console's Owner column reads, and it
 * is omitted rather than mirrored because the CLI already prints the fact it
 * carries: `VibeAppDto.createdByUserId` is mirrored, and the two are the same
 * attribution at different resolutions. Mirroring the summary as well would
 * invite a second, name-shaped ownership column in a table that is already
 * wide, and composing a display name is a rendering decision this package has
 * not made. The id is what a CLI user pipes into another command; the name is
 * what a grid renders.
 */
const _appListItem: Mirrors<
  "VibeAppListItemDto",
  ListVibeAppsResponse["apps"][number],
  VibeData<"ListApps">["apps"][number],
  "icon" | "linkedToolId" | "latestDeployment" | "servingDeployment" | "createdBy"
> = AGREES;

const _getApp: Mirrors<"GetVibeAppResponse", GetVibeAppResponse, VibeData<"GetApp">> = AGREES;

const _createApp: Mirrors<
  "CreateVibeAppResponse",
  CreateVibeAppResponse,
  VibeData<"CreateApp">
> = AGREES;

const _updateApp: Mirrors<
  "SingleVibeAppResponse",
  SingleVibeAppResponse,
  VibeData<"UpdateApp">
> = AGREES;

const _deleteApp: Mirrors<"DeletedIdResponse", DeletedIdResponse, VibeData<"DeleteApp">> = AGREES;

const _gitProjectSummary: Mirrors<
  "VibeAppGitProjectSummaryDto",
  VibeAppGitProjectSummaryDto,
  NonNullable<VibeData<"GetApp">["gitProject"]>
> = AGREES;

// ============================================================
// Edge token + visibility
// ============================================================

const _edgeToken: Mirrors<
  "VibeEdgeTokenDto",
  VibeEdgeTokenDto,
  VibeData<"GetEdgeToken">["edgeToken"]
> = AGREES;

const _getEdgeToken: Mirrors<
  "GetEdgeTokenResponse",
  GetEdgeTokenResponse,
  VibeData<"GetEdgeToken">
> = AGREES;

const _rotateEdgeToken: Mirrors<
  "RotateEdgeTokenResponse",
  RotateEdgeTokenResponse,
  VibeData<"RotateEdgeToken">
> = AGREES;

const _setVisibility: Mirrors<
  "SetVisibilityResponse",
  SetVisibilityResponse,
  VibeData<"SetAppVisibility">
> = AGREES;

// ============================================================
// Git projects + credentials
// ============================================================

/**
 * A FULL mirror, despite the "Subset of VibeGitProjectSchema" the declaration used to
 * carry: the wire shape has twelve fields and the CLI declares all twelve. The comment
 * was wrong in the direction that costs — it invited a reader to assume a missing field
 * was a deliberate omission rather than drift, which is exactly the reasoning this file
 * exists to replace.
 */
type WireGitProject = VibeData<"GetGitProjectById">["gitProject"];

const _gitProject: Mirrors<"VibeGitProjectDto", VibeGitProjectDto, WireGitProject> = AGREES;

const _standaloneGitProject: Mirrors<
  "StandaloneVibeGitProjectResponse",
  StandaloneVibeGitProjectResponse,
  VibeData<"GetGitProjectById">
> = AGREES;

/**
 * The app-scoped read still carries the deprecated `repository` alias beside the
 * canonical key, so both are asserted — `gitProject` optional, `repository` a PARTIAL
 * project. Typing the alias as a full project was a lie the printer could have rendered
 * as `undefined`; see {@link VibeGitProjectAliasDto}.
 */
const _appScopedGitProject: Mirrors<
  "SingleVibeGitProjectResponse",
  SingleVibeGitProjectResponse,
  VibeData<"GetGitProject">
> = AGREES;

const _gitProjectAlias: Mirrors<
  "VibeGitProjectAliasDto",
  VibeGitProjectAliasDto,
  VibeData<"GetGitProject">["repository"]
> = AGREES;

const _listGitProjects: Mirrors<
  "ListVibeGitProjectsResponse",
  ListVibeGitProjectsResponse,
  VibeData<"ListGitProjects">
> = AGREES;

const _gitCredentials: Mirrors<
  "VibeGitCredentialsDto",
  VibeGitCredentialsDto,
  VibeData<"GetGitCredentials">["credentials"]
> = AGREES;

const _getGitCredentials: Mirrors<
  "GetGitCredentialsResponse",
  GetGitCredentialsResponse,
  VibeData<"GetGitCredentials">
> = AGREES;

// ============================================================
// Deployments + build jobs
// ============================================================

type WireDeployment = VibeData<"GetDeployment">["deployment"];

/**
 * `organizationId` and `updatedAt` are on every row and are never rendered — the org is
 * the API key's, and a deployment is immutable after its terminal status. `shipGateMode`
 * is the app's setting captured on the row, printed by neither. `triggerSource`,
 * `createdByUserId` and `createdByName` are the console's "who shipped this" column;
 * the CLI's caller is the person asking.
 */
const _deployment: Mirrors<
  "VibeDeploymentDto",
  VibeDeploymentDto,
  WireDeployment,
  | "organizationId"
  | "triggerSource"
  | "shipGateMode"
  | "createdByUserId"
  | "createdByName"
  | "updatedAt"
> = AGREES;

type WireBuildJob = NonNullable<VibeData<"GetDeployment">["buildJob"]>;

/** Same two as the deployment above, for the same two reasons. */
const _buildJob: Mirrors<
  "VibeBuildJobDto",
  VibeBuildJobDto,
  WireBuildJob,
  "organizationId" | "updatedAt"
> = AGREES;

const _getDeployment: Mirrors<
  "GetDeploymentResponse",
  GetDeploymentResponse,
  VibeData<"GetDeployment">
> = AGREES;

const _listDeployments: Mirrors<
  "ListDeploymentsResponse",
  ListDeploymentsResponse,
  VibeData<"ListDeployments">
> = AGREES;

const _rollback: Mirrors<
  "RollbackAppResponse",
  RollbackAppResponse,
  VibeData<"RollbackApp">
> = AGREES;

// ============================================================
// Deploy state
// ============================================================

/**
 * The response `vibe deploy-state` renders, mirrored in full — no declared
 * omissions, deliberately.
 *
 * Every field of this payload is part of the answer: drop `served` and the
 * command cannot distinguish "proof has not arrived" from "the edge is still on
 * the old build", drop `resolved` and a caller who named nothing cannot tell
 * WHICH commit was answered about. A future field arriving here should stop the
 * build until someone decides whether the operator needs it, which is exactly
 * what an empty `Declared` makes happen.
 */
const _deployState: Mirrors<
  "GetDeployStateResponse",
  GetDeployStateResponse,
  VibeData<"GetDeployState">
> = AGREES;

const _deployStateRef: Mirrors<
  "VibeRefDto",
  VibeRefDto,
  NonNullable<VibeData<"GetDeployState">["ref"]>
> = AGREES;

const _liveDeployment: Mirrors<
  "VibeLiveDeploymentDto",
  VibeLiveDeploymentDto,
  NonNullable<VibeData<"GetDeployState">["live"]>
> = AGREES;

/**
 * `provenAt` and `healthyToServedMs` are mirrored and RENDERED, not merely
 * declared. An observation printed without its age is the defect this endpoint
 * exists to close, one layer up — so a future edit that drops either field has
 * to come through here first.
 */
const _servedArtifact: Mirrors<
  "VibeServedArtifactDto",
  VibeServedArtifactDto,
  NonNullable<VibeData<"GetDeployState">["served"]>
> = AGREES;

/**
 * The outcome union is the whole point of the endpoint, and the renderer
 * switches on it — so the CLI's copy must hold EVERY value the contract can
 * send. Assignability in this direction is what catches a new value: a widened
 * `string` would pass every assertion above while the renderer silently fell
 * through to its unknown-value arm.
 */
const _deployStateOutcome: VibeDeployStateOutcome extends VibeData<"GetDeployState">["outcome"]
  ? VibeData<"GetDeployState">["outcome"] extends VibeDeployStateOutcome
    ? true
    : ["VibeDeployStateOutcome", "is missing a value the contract can send"]
  : ["VibeDeployStateOutcome", "declares a value the contract cannot send"] = true;

/**
 * The trigger response is a union discriminated on `status`, and `keyof` a union yields
 * only the keys every arm shares — so each arm is asserted on its own or the check
 * degenerates to comparing `{ status }` with `{ status }`.
 *
 * The arms are split by EXCLUDING the confirmation arm rather than by extracting the
 * success one. `Extract<…, { status: "created" }>` looks like the obvious way and
 * silently yields `never`: the CLI models created and reused as ONE arm typed
 * `status: "created" | "reused"`, and that union is not assignable to the single literal.
 * A `never` on both sides then satisfies every assertion in `Mirrors` — the check would
 * pass while comparing nothing, which is the failure mode this whole file exists to end.
 * The wire keeps them as two arms; both carry identical keys, so `keyof` over the pair is
 * the same set either way.
 */
type WireTrigger = VibeData<"TriggerDeployment">;
type ConfirmationArm = { status: "confirmation_required" };

const _triggerSuccess: Mirrors<
  "TriggerDeploymentResponse (created | reused)",
  Exclude<TriggerDeploymentResponse, ConfirmationArm>,
  Exclude<WireTrigger, ConfirmationArm>
> = AGREES;

const _triggerConfirmation: Mirrors<
  "TriggerDeploymentResponse (confirmation_required)",
  Extract<TriggerDeploymentResponse, ConfirmationArm>,
  Extract<WireTrigger, ConfirmationArm>
> = AGREES;

/**
 * Both arms are non-empty. Guards the split itself: every assertion above is vacuously
 * satisfied if `Exclude`/`Extract` returns `never`, and that is precisely what the
 * obvious spelling of this split does.
 */
const _triggerArmsNonEmpty: [
  [Exclude<TriggerDeploymentResponse, ConfirmationArm>] extends [never]
    ? ["the CLI trigger union has no success arm — the split above checks nothing"]
    : true,
  [Extract<WireTrigger, ConfirmationArm>] extends [never]
    ? ["the wire trigger union has no confirmation arm — the split above checks nothing"]
    : true
] = [true, true];

// ============================================================
// Env vars
// ============================================================

/**
 * `secretMaterial` is the write gate's verdict on a stored value. It is not
 * rendered because `env list` prints values, and a per-row verdict beside a
 * value the reader can see for themselves adds a column without adding a fact.
 */
const _envVar: Mirrors<
  "VibeAppEnvVarDto",
  VibeAppEnvVarDto,
  VibeData<"ListEnvVars">["envVars"][number],
  "secretMaterial"
> = AGREES;

/**
 * `cardBindings` is OPTIONAL on both sides, and the gate is what keeps it that
 * way. The CLI ships standalone and is routinely pointed at a backend older
 * than itself, so ABSENT ("this server has nothing to say about cards") is a
 * different fact from `[]` ("it does, and this app has none"). A future
 * required-ing of the wire field would land here as a mismatch rather than as a
 * CLI that silently reports every old backend's apps as holding no cards.
 */
const _listEnvVars: Mirrors<
  "ListEnvVarsResponse",
  ListEnvVarsResponse,
  VibeData<"ListEnvVars">
> = AGREES;

/**
 * The card rows `env list` renders beside the plaintext variables.
 *
 * Every field is mirrored — there is no declared omission — because each one is
 * on screen: the handle is the value the app reads, `status` and the two quota
 * fields make the Status column, and `credentialName` / `accessCardName` make
 * the Card column that says whose authority a row spends.
 *
 * `NonNullable` because the wire field is optional; the element type is what
 * the CLI models, and the optionality itself is checked by `_listEnvVars`.
 */
const _cardBinding: Mirrors<
  "VibeAppCardBindingDto",
  VibeAppCardBindingDto,
  NonNullable<VibeData<"ListEnvVars">["cardBindings"]>[number]
> = AGREES;

const _upsertEnvVar: Mirrors<
  "UpsertEnvVarResponse",
  UpsertEnvVarResponse,
  VibeData<"UpsertEnvVar">
> = AGREES;

const _deleteEnvVar: Mirrors<
  "DeleteEnvVarResponse",
  DeleteEnvVarResponse,
  VibeData<"DeleteEnvVar">
> = AGREES;

// ============================================================
// Approvals
// ============================================================

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

type WireAuditPayload = VibeData<"ListAuditEvents">["events"][number]["payload"];
type WireAuditArm<E extends string> = Extract<WireAuditPayload, { eventType: E }>;

/**
 * The six payloads the CLI renders field by field. The other twenty-eight are
 * printed generically by `formatUnmodelledDetails` and are covered by the
 * discriminant assertion below instead — an interface each would be
 * declarations no reader consults and no code narrows on.
 */
const _auditTriggered: Mirrors<
  "AuditPayloadDeploymentTriggered",
  AuditPayloadDeploymentTriggered,
  WireAuditArm<"DEPLOYMENT_TRIGGERED">
> = AGREES;

/**
 * One CLI interface covers both approval outcomes, so it is compared against BOTH wire
 * arms at once rather than each in turn — same reason as the trigger split above.
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
  Exclude<WireAuditPayload["eventType"], (typeof VIBE_AUDIT_EVENT_TYPES)[number]>
] extends [never]
  ? true
  : [
      "the audit payload union carries an event type the generated list does not:",
      Exclude<WireAuditPayload["eventType"], (typeof VIBE_AUDIT_EVENT_TYPES)[number]>
    ] = true;

// ============================================================
// Public-API bridge
// ============================================================

/**
 * `app register-as-tool` is the one Vibe command that leaves the tenant surface
 * for `/api/public/v1`, so its response is a different contract with a
 * different envelope — bare, not `ApiSuccess`-wrapped.
 */
const _registeredTool: Mirrors<
  "ExternalToolDetail",
  ExternalToolDetail,
  Wire<TApiPublicV1["VibeRegisterAppAsTool"]["Response"]>
> = AGREES;

// ============================================================
// Runtime logs — the page, the follow, and the three ceilings
// ============================================================

const _logLine: Mirrors<"VibeLogLineDto", VibeLogLineDto, VibeData<"GetAppLogs">["lines"][number]> =
  AGREES;

const _getAppLogs: Mirrors<
  "GetVibeAppLogsResponse",
  GetVibeAppLogsResponse,
  VibeData<"GetAppLogs">
> = AGREES;

/**
 * The SSE frame union, arm by arm.
 *
 * `Mirrors` compares object KEYS, and `keyof` a union is only the keys every arm
 * shares — which for a discriminated union is `type` alone. Comparing the unions
 * whole would therefore assert almost nothing while looking thorough. Extracting
 * each arm on its discriminant is what makes `lines`, `reason` and `message`
 * actually get checked.
 *
 * The frame contract has no `TApi` entry by design — the stream sits outside the
 * codegen — so this reads the Zod schema's own output type. `["_output"]` rather
 * than `z.infer<…>` because it needs no `zod` import, which this package does not
 * have even as a devDependency.
 */
type WireStreamFrame = Wire<(typeof NexusTypes.VibeAppLogStreamEventSchema)["_output"]>;
type ArmOf<TUnion, TType extends string> = Extract<TUnion, { type: TType }>;

const _logFrameLines: Mirrors<
  "VibeAppLogStreamFrame(lines)",
  ArmOf<VibeAppLogStreamFrame, "lines">,
  ArmOf<WireStreamFrame, "lines">
> = AGREES;

const _logFrameEnd: Mirrors<
  "VibeAppLogStreamFrame(end)",
  ArmOf<VibeAppLogStreamFrame, "end">,
  ArmOf<WireStreamFrame, "end">
> = AGREES;

const _logFrameError: Mirrors<
  "VibeAppLogStreamFrame(error)",
  ArmOf<VibeAppLogStreamFrame, "error">,
  ArmOf<WireStreamFrame, "error">
> = AGREES;

/** Every `type` the wire union spells, and no others. */
type Discriminants<TUnion> = TUnion extends { type: infer TType } ? TType : never;

const _logFrameDiscriminants: SameMembers<
  "VibeAppLogStreamFrame",
  Discriminants<VibeAppLogStreamFrame>,
  Discriminants<WireStreamFrame>
> = true;

/**
 * The end reasons, so a second reason added upstream fails here rather than
 * arriving as a value the CLI's own union calls impossible.
 */
const _logEndReasons: SameMembers<
  "VIBE_APP_LOG_STREAM_END_REASONS",
  VibeAppLogStreamEndReason,
  (typeof NexusTypes.VIBE_APP_LOG_STREAM_END_REASONS)[number]
> = true;

const _logColors: SameMembers<
  "VIBE_LOG_COLORS",
  VibeLogColor,
  (typeof NexusTypes.VibeLogColorSchema)["_output"]
> = true;

/**
 * The two numeric ceilings, compared as LITERAL types.
 *
 * This works only because both constants are declared as bare numeric literals,
 * which TypeScript widens to a literal type on a `const`. `VIBE_LOG_GATEWAY_MAX_RANGE_MS`
 * is `7 * 24 * 60 * 60 * 1000` — a computed expression, inferred as `number` — so
 * it cannot be gated this way and is mirrored by reading instead, with that said
 * out loud where the CLI declares it (`util/log-window.ts`).
 *
 * `SameLiteral` checks BOTH directions on purpose. A one-way `extends` would pass
 * vacuously the day the upstream type widens to `number`, which is the exact
 * moment the gate stops meaning anything.
 */
const _maxLimit: SameLiteral<
  "VIBE_LOG_WIRE_MAX_LIMIT",
  typeof VIBE_LOG_WIRE_MAX_LIMIT,
  typeof NexusTypes.VIBE_LOG_GATEWAY_MAX_LIMIT
> = true;

const _maxContains: SameLiteral<
  "VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH",
  typeof VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH,
  typeof NexusTypes.VIBE_LOG_GATEWAY_MAX_CONTAINS_LENGTH
> = true;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist, and
 * keeps a reader from concluding the file is dead and removing it.
 */
export const VIBE_WIRE_TYPES_CONFORM = [
  _app,
  _appListItem,
  _getApp,
  _createApp,
  _updateApp,
  _deleteApp,
  _gitProjectSummary,
  _edgeToken,
  _getEdgeToken,
  _rotateEdgeToken,
  _setVisibility,
  _gitProject,
  _standaloneGitProject,
  _appScopedGitProject,
  _gitProjectAlias,
  _listGitProjects,
  _gitCredentials,
  _getGitCredentials,
  _deployment,
  _buildJob,
  _getDeployment,
  _listDeployments,
  _rollback,
  _deployState,
  _deployStateRef,
  _liveDeployment,
  _servedArtifact,
  _deployStateOutcome,
  _triggerSuccess,
  _triggerArmsNonEmpty,
  _triggerConfirmation,
  _envVar,
  _listEnvVars,
  _cardBinding,
  _upsertEnvVar,
  _deleteEnvVar,
  _approvalRequest,
  _approvalDecision,
  _getApproval,
  _recordDecision,
  _listPending,
  _auditEvent,
  _listAuditEvents,
  _auditTriggered,
  _auditApprovalDecision,
  _auditApprovalArmsNonEmpty,
  _auditExpired,
  _auditSuspended,
  _auditRolledBack,
  _auditServed,
  _auditDiscriminants,
  _registeredTool,
  _logLine,
  _getAppLogs,
  _logFrameLines,
  _logFrameEnd,
  _logFrameError,
  _logFrameDiscriminants,
  _logEndReasons,
  _logColors,
  _maxLimit,
  _maxContains
] as const;
