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
 * generated Prisma enums) stays out of `dist/`. `wire-types-bundle.test.ts` holds
 * that property as an assertion rather than as this paragraph: it fails if any
 * module the binary CAN reach imports `@nexus/types`.
 */

import type { TApiPublicV1 } from "@nexus/types/public-api-v1";

import type { VibeUnlistedVariant } from "./vibe-unlisted-variant";
import type {
  CancelDeploymentBuildResponse,
  CreateVibeAppResponse,
  DeletedIdResponse,
  ExternalToolDetail,
  GetDeploymentResponse,
  GetDeployStateResponse,
  GetEdgeTokenResponse,
  GetGitProjectCredentialsResponse,
  GetVibeAppResponse,
  ListDeploymentsResponse,
  ListVibeAppsResponse,
  ListVibeGitProjectsResponse,
  RollbackAppResponse,
  RotateEdgeTokenResponse,
  SetVisibilityResponse,
  SingleVibeAppResponse,
  SingleVibeGitProjectResponse,
  StandaloneVibeGitProjectResponse,
  TriggerDeploymentResponse,
  VibeAppDeployability,
  VibeAppDto,
  VibeAppEdgeReachability,
  VibeAppGitProjectSummaryDto,
  VibeAppVisibility,
  VibeBuildComputeSize,
  VibeEdgeTokenDto,
  VibeGitProjectAliasDto,
  VibeGitProjectCredentialsDto,
  VibeGitProjectDto,
  VibeLiveDeploymentDto,
  VibeRefDto,
  VibeServedArtifactDto,
  VibeShipGateMode
} from "./vibe-wire-types";
import {
  type Listed,
  type ListedArms,
  type SameMembers,
  type UnlistedArmAdmitted,
  type VibeData
} from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

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
 *
 * `deploymentHistory` is omitted for the reason the two deployment summaries
 * are, one step further: it is a bounded WINDOW plus a set of counts, and
 * `vibe deployments list` already prints every attempt at full fidelity with
 * nothing dropped and nothing classified. Mirroring a truncated twelve beside
 * it would put a second, lossier history surface in the same binary — and the
 * counts carry a judgement (`vibeDeploymentOutcome`, which reads a rolled-back
 * version as failed) that a table printing raw statuses deliberately does not
 * make. A grid draws twelve ticks because that is what fits; a terminal has the
 * whole list.
 */
const _appListItem: Mirrors<
  "VibeAppListItemDto",
  ListVibeAppsResponse["apps"][number],
  VibeData<"ListApps">["apps"][number],
  | "icon"
  | "linkedToolId"
  | "latestDeployment"
  | "servingDeployment"
  | "createdBy"
  | "deploymentHistory"
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

/**
 * The app's lenient fields hold `Listed | VibeUnlistedValue`, which every wire
 * value satisfies — so `Mirrors` alone would wave a NEWLY LISTED value through
 * as unlisted. These pin each listed set to the contract's, both directions.
 */
const _shipGateModes: SameMembers<
  "VibeShipGateMode",
  VibeShipGateMode,
  Listed<WireApp["shipGateMode"]>
> = true;
const _buildComputeSizes: SameMembers<
  "VibeBuildComputeSize",
  VibeBuildComputeSize,
  Listed<WireApp["buildComputeSize"]>
> = true;
const _appVisibilities: SameMembers<
  "VibeAppVisibility",
  VibeAppVisibility,
  Listed<WireApp["visibility"]>
> = true;
const _edgeReachabilities: SameMembers<
  "VibeAppEdgeReachability",
  VibeAppEdgeReachability,
  Listed<NonNullable<WireApp["edgeReachability"]>>
> = true;
const _deployabilities: SameMembers<
  "VibeAppDeployability",
  VibeAppDeployability,
  Listed<VibeData<"GetApp">["deployability"]>
> = true;

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

const _gitProjectCredentials: Mirrors<
  "VibeGitProjectCredentialsDto",
  VibeGitProjectCredentialsDto,
  VibeData<"GetGitProjectCredentials">["credentials"]
> = AGREES;

const _getGitProjectCredentials: Mirrors<
  "GetGitProjectCredentialsResponse",
  GetGitProjectCredentialsResponse,
  VibeData<"GetGitProjectCredentials">
> = AGREES;

// ============================================================
// Deployments + build jobs
// ============================================================

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
 * the same set either way. Both run on the LISTED arms; `_triggerUnlisted` covers the rest.
 */
type WireTrigger = ListedArms<VibeData<"TriggerDeployment">, "status">;
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

/**
 * A status a newer backend added: the trigger flow asks `isListedVariant` first
 * and prints the server's word, so the twin must admit every such answer.
 */
const _triggerUnlisted: UnlistedArmAdmitted<
  "TriggerDeploymentReadResponse",
  VibeUnlistedVariant<"status">,
  VibeData<"TriggerDeployment">,
  "status"
> = true;

/**
 * Cancel — split per arm on `outcome` by EXTRACTING each literal, which is sound
 * here where it is not for the trigger above: the CLI models each outcome as its
 * own arm, exactly as the wire does. The non-empty guard below still proves each
 * extraction found an arm, because an empty one satisfies every `Mirrors` check.
 */
type WireCancel = VibeData<"CancelDeploymentBuild">;
type CancelledArm = { outcome: "cancelled" };
type AlreadyEndedArm = { outcome: "already_ended" };

const _cancelCancelled: Mirrors<
  "CancelDeploymentBuildResponse (cancelled)",
  Extract<CancelDeploymentBuildResponse, CancelledArm>,
  Extract<WireCancel, CancelledArm>
> = AGREES;

const _cancelAlreadyEnded: Mirrors<
  "CancelDeploymentBuildResponse (already_ended)",
  Extract<CancelDeploymentBuildResponse, AlreadyEndedArm>,
  Extract<WireCancel, AlreadyEndedArm>
> = AGREES;

const _cancelArmsNonEmpty: [
  [Extract<CancelDeploymentBuildResponse, CancelledArm>] extends [never]
    ? ["the CLI cancel union has no cancelled arm — the split above checks nothing"]
    : true,
  [Extract<CancelDeploymentBuildResponse, AlreadyEndedArm>] extends [never]
    ? ["the CLI cancel union has no already_ended arm — the split above checks nothing"]
    : true,
  [Extract<WireCancel, CancelledArm>] extends [never]
    ? ["the wire cancel union has no cancelled arm — the split above checks nothing"]
    : true,
  [Extract<WireCancel, AlreadyEndedArm>] extends [never]
    ? ["the wire cancel union has no already_ended arm — the split above checks nothing"]
    : true
] = [true, true, true, true];

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
  _shipGateModes,
  _buildComputeSizes,
  _appVisibilities,
  _edgeReachabilities,
  _deployabilities,
  _edgeToken,
  _getEdgeToken,
  _rotateEdgeToken,
  _setVisibility,
  _gitProject,
  _standaloneGitProject,
  _appScopedGitProject,
  _gitProjectAlias,
  _listGitProjects,
  _gitProjectCredentials,
  _getGitProjectCredentials,
  _getDeployment,
  _listDeployments,
  _rollback,
  _deployState,
  _deployStateRef,
  _liveDeployment,
  _servedArtifact,
  _triggerSuccess,
  _triggerArmsNonEmpty,
  _triggerUnlisted,
  _cancelCancelled,
  _cancelAlreadyEnded,
  _cancelArmsNonEmpty,
  _triggerConfirmation,
  _registeredTool
] as const;
