/**
 * The WIRE SHAPES `nexus vibe …` reads off the Vibe HTTP surface.
 *
 * These mirror the Zod schemas under
 * `packages/types/src/api/domains/vibe/schemas/`. The CLI is published as a
 * standalone npm package and `@nexus/types` is not a runtime dependency, so the
 * shapes are re-declared here rather than imported.
 *
 * A COMMENT ASKING FOR LOCKSTEP IS NOT A MECHANISM, and this file used to have
 * only that. `vibe-wire-types.conformance.ts` is the mechanism: it imports the
 * real schemas and fails `pnpm typecheck` when a declaration here stops matching
 * one — a field added to a schema, a field removed, a type narrowed. A shape the
 * CLI deliberately renders only part of declares the omitted field names there,
 * so a NEW omission has to be written down before it compiles.
 *
 * The module exists so those assertions have something to import. Everything
 * here is a declaration the command file consumed inline before; nothing about
 * the wire behaviour changed in the move.
 *
 * It never reaches the published binary as a dependency edge: the conformance
 * module is unreachable from `src/index.ts`, so tsup leaves it — and the
 * `@nexus/types` import it carries — out of the bundle.
 */

import {
  VIBE_AUDIT_EVENT_TYPES,
  type VibeAuditEventType
} from "./vibe-audit-event-types.generated";

// ============================================================
// Audit feed — mirrors audit-events.schemas.ts.
// ============================================================

/**
 * Mirrors `VIBE_APP_DEFAULT_CONTAINER_PORT` in
 * `packages/types/src/schemas/VibeApp/container-port.ts`, re-declared for the
 * same reason as the wire types above — this package cannot depend on
 * `@nexus/types` at runtime.
 *
 * Used only to NAME the fallback in a message ("not detected — using 8080"),
 * never to decide anything: the port that is actually published is resolved
 * server-side. So a drift here misprints a hint; it cannot mis-deploy.
 */
export const VIBE_DEFAULT_CONTAINER_PORT = 8080;

export function isAuditEventType(v: string): v is VibeAuditEventType {
  return (VIBE_AUDIT_EVENT_TYPES as readonly string[]).includes(v);
}

export interface AuditPayloadDeploymentTriggered {
  eventType: "DEPLOYMENT_TRIGGERED";
  vibeDeploymentId: string;
  triggerSha: string;
  approvalGated: boolean;
  /**
   * What kicked the deploy off. Optional on the wire and therefore here: rows
   * written before the field existed carry no source, and absent means "predates
   * the field", never "unknown source".
   *
   * This file did not declare it at all until the conformance gate compared the
   * two — so `vibe audit list` could not answer the question the field was added
   * for, "why did this app deploy twice for one commit".
   */
  triggerSource?: "GIT_PUSH" | "CLI" | "CONSOLE";
}
export interface AuditPayloadApprovalDecision {
  eventType: "DEPLOYMENT_APPROVED" | "DEPLOYMENT_REJECTED";
  vibeApprovalRequestId: string;
  vibeDeploymentId: string;
  deciderUserId: string;
  decisive: boolean;
  note: string | null;
}
export interface AuditPayloadApprovalExpired {
  eventType: "APPROVAL_EXPIRED";
  vibeApprovalRequestId: string;
  vibeDeploymentId: string;
}
export interface AuditPayloadCostSafetyAutoSuspended {
  eventType: "COST_SAFETY_AUTO_SUSPENDED";
  /**
   * `VIBE_BACKUP_MIN` was missing here while the wire enum has carried four
   * values. A suspension on backup minutes would have arrived as a value this
   * union says is impossible — the CLI still prints it, because nothing
   * validates at runtime, but any narrowing written against these three would
   * have silently dropped the one event that says why an app stopped.
   */
  usageType: "VIBE_COMPUTE_MIN" | "VIBE_BUILD_MIN" | "VIBE_EGRESS_MB" | "VIBE_BACKUP_MIN";
  breachedSum: number;
  effectiveCap: number;
  billingPeriod: string;
}
export interface AuditPayloadDeploymentRolledBack {
  eventType: "DEPLOYMENT_ROLLED_BACK_COST_SAFETY";
  vibeDeploymentId: string;
  priorStatus: "BUILDING" | "AWAITING_APPROVAL" | "DEPLOYING" | "HEALTHY";
  triggerSha: string;
  suspendedReason: string | null;
}

/**
 * The terminal "it is actually live" — written when the app's public URL was
 * observed answering FROM this deployment.
 *
 * `DEPLOYMENT_HEALTHY` does not mean that and cannot: it is the allocation's
 * verdict and lands before the edge swaps content, by up to whole minutes. This
 * is the event to poll for after a `nexus vibe deploy`; polling HEALTHY reads
 * the previous build and looks like the wrong code shipped.
 */
export interface AuditPayloadDeploymentServed {
  eventType: "DEPLOYMENT_SERVED";
  vibeDeploymentId: string;
  triggerSha: string;
  imageRef: string;
  color: "BLUE" | "GREEN";
  /// Milliseconds from the healthy flip to this observation. An UPPER bound —
  /// the probe samples on a tick, so it notices the swap some time after it
  /// happened.
  healthyToServedMs: number;
}

/** The event types this file declares a payload interface for. */
export type ModelledAuditPayload =
  | AuditPayloadDeploymentTriggered
  | AuditPayloadApprovalDecision
  | AuditPayloadApprovalExpired
  | AuditPayloadCostSafetyAutoSuspended
  | AuditPayloadDeploymentRolledBack
  | AuditPayloadDeploymentServed;

/**
 * Every OTHER event type the feed emits — 28 of the 34, at the time of
 * writing — whose payload this file does not mirror field by field.
 *
 * They are not hypothetical and never were: the feed has always returned them
 * and `vibe audit list` has always printed them. Leaving them out of the union
 * did not keep them out of the output, it only left the printer believing the
 * `switch` below was exhaustive — so an unmodelled row fell off the end of
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

export type AuditPayload = ModelledAuditPayload | AuditPayloadUnmodelled;

export interface VibeAuditEvent {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  vibeAppId: string | null;
  payload: AuditPayload;
  createdAt: string;
}

export interface ListAuditEventsResponse {
  events: VibeAuditEvent[];
  nextCursor: string | null;
}

/**
 * The registered-tool detail returned by the register-as-tool bridge.
 * Mirrors `ExternalToolDetailSchema` in
 * packages/types/src/api/public/v1/schemas/skills.schemas.ts.
 */
export interface ExternalToolDetail {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  documentation: string | null;
  type: "CUSTOM_MANIFEST";
  endpointUrl: string | null;
  status: string;
  actionsCount: number;
  authType: string;
  createdAt: string;
}

/**
 * A Vibe app, mirroring `VibeAppSchema` in
 * packages/types/src/api/domains/vibe/schemas/core.ts. Keep in lockstep
 * (the CLI ships standalone — `@nexus/types` is not a runtime dep).
 */
export interface VibeAppDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  requireApprovals: boolean;
  requireVerification: boolean;
  deployBranch: string;
  resourceQuotas: { cpuMhz: number; memoryMiB: number; maxInstances: number };
  healthCheckConfig: Record<string, unknown>;
  publicUrl: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  /**
   * What the tenant's edge last said about this app's public host. `null` means
   * NEVER OBSERVED — the probe only asks about a healthy, settled deployment —
   * and must never be printed as if it meant healthy.
   */
  edgeReachability: "ROUTED" | "UNROUTED" | "UNAVAILABLE" | "NO_SUCH_APP" | "UNKNOWN" | null;
  edgeReachabilityAt: string | null;
  edgeReachabilityDetail: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Why an app can or cannot deploy right now — the ONE thing standing in the
 * way, named. Mirrors `VibeAppDeployability` in
 * packages/types/src/shared/domain/vibe/app-deployability.ts.
 *
 * DERIVED server-side from the git project that resolves for the app, never
 * stored, so it cannot go stale. It is the one-field answer to "why does my
 * URL do nothing": before it, an app with no source at all rendered exactly
 * like a correctly-wired app nobody had pushed to yet.
 */
export type VibeAppDeployability = "DEPLOYABLE" | "NO_SOURCE_ATTACHED" | "SOURCE_NOT_READY";

/**
 * A reference to one git project, as the app envelopes carry it. Mirrors
 * `VibeAppGitProjectSummarySchema`, which is the single backend shape behind
 * BOTH uses: the project attached to an app (`GetApp`), and the project that
 * already holds a name a new app wanted (`CreateApp`).
 */
export interface VibeAppGitProjectSummaryDto {
  id: string;
  name: string;
  status: string;
}

/**
 * `deployability` and `gitProject` sit BESIDE the app on every envelope that
 * carries them, never on the app itself — deliberately, per
 * `GetVibeAppResponseSchema`'s own comment: they are a join, and putting them
 * on the app would oblige every producer of a `VibeApp` (including create,
 * which has no project yet) to resolve one.
 *
 * So they are mixed in HERE rather than added to {@link VibeAppDto}, and the
 * printer takes them as a separate argument.
 */
export interface VibeAppEnvelopeExtras {
  deployability: VibeAppDeployability;
  gitProject: VibeAppGitProjectSummaryDto | null;
}

/**
 * The list read carries the extras per item, because the grid must be able to
 * mark an app that will never build without an N+1 of git-project fetches.
 */
export type VibeAppListItemDto = VibeAppDto & VibeAppEnvelopeExtras;

export interface ListVibeAppsResponse {
  apps: VibeAppListItemDto[];
}

/**
 * Just the app — `UpdateVibeAppResponseSchema` exactly, and the base that
 * CREATE and GET each extend in their own direction.
 *
 * Neither of those extensions carries `deployability`: create has no project
 * yet, and update does not resolve one. Typing them as the richer get-response
 * below would be a lie the CLI could then print as `undefined`.
 */
export interface SingleVibeAppResponse {
  app: VibeAppDto;
}

/** `GET /api/vibe/apps/:id` — the app PLUS the joins only this read resolves. */
export type GetVibeAppResponse = SingleVibeAppResponse & VibeAppEnvelopeExtras;

/**
 * `app create`'s response. Mirrors `CreateVibeAppResponseSchema` — the same
 * app, plus a warning the plain single-app reads have no reason to carry.
 */
export interface CreateVibeAppResponse extends SingleVibeAppResponse {
  /**
   * A live git project in the org that already goes by this app's name. The app
   * was still created — this is a heads-up that `provision-repo` will 409 on
   * that name, and that `attach-repo` is what the caller almost certainly wants
   * instead.
   *
   * Optional as well as nullable: a published CLI outlives the backend release
   * it was built against, so an older server omits the key entirely. Absent and
   * `null` both mean "no collision", and the print site treats them alike.
   */
  gitProjectNameCollision?: VibeAppGitProjectSummaryDto | null;
}

/**
 * An app's per-app edge-auth token — the shared secret the edge matches before
 * admitting a request to a PRIVATE app. Mirrors `VibeEdgeTokenSchema` in
 * packages/types/src/api/domains/vibe/schemas/edge-token.schemas.ts.
 *
 * `token` is a live credential: presenting it at the edge grants access to the
 * deployed app. It is printed only by `app edge-token` and `app
 * rotate-edge-token`, where revealing it is the whole point of the command.
 */
export interface VibeEdgeTokenDto {
  token: string;
  /** The header the edge matches the token against (`X-Vibe-App-Token`). */
  headerName: string;
  /** The app's canonical public URL. Null only for pre-canonical-URL rows. */
  publicUrl: string | null;
}

export interface SetVisibilityResponse {
  app: VibeAppDto;
  /**
   * The freshly-minted edge token, present only when going PRIVATE.
   * Deliberately NOT printed: this command's job is the posture change, and the
   * token has its own reveal command that says what it is.
   *
   * This was typed `string | null` until 2026-07-27, which the server contract
   * never matched — `SetVibeAppVisibilityResponseSchema` has always nested the
   * secret in the same three-field object as reveal and rotate. Nothing caught
   * it because the field is never read, so the lie stayed inert: a future reader
   * printing `data.edgeToken` would have rendered `[object Object]`.
   */
  edgeToken: VibeEdgeTokenDto | null;
  /** True when the app is registered as a tool and its edge token was rotated. */
  toolResyncRequired: boolean;
}

export interface GetEdgeTokenResponse {
  edgeToken: VibeEdgeTokenDto;
}

export interface RotateEdgeTokenResponse {
  edgeToken: VibeEdgeTokenDto;
  /**
   * True when the app is registered as an agent tool. Rotating invalidates the
   * token baked into that tool's auth, so it must be re-registered or it starts
   * 404-ing at the edge.
   */
  toolResyncRequired: boolean;
}

/** Both delete routes answer with the id they removed. */
export interface DeletedIdResponse {
  deletedId: string;
}

/** Subset of VibeGitProjectSchema the CLI renders. */
export interface VibeGitProjectDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  s3Prefix: string;
  hookSecretRef: string;
  /**
   * What the build executor clones — NEVER a push URL, so don't label it
   * "Git URL": a user's push remote comes from `nexus vibe git-credentials`,
   * which composes the public `cloneUrlBase`
   * (`https://git.<tenant>.<domain>/<org>/`).
   *
   * Its reachability varies by provenance, so don't assert one: when the agent
   * materializes the repo it composes this from Forgejo's in-VPC baseUrl
   * (unreachable from a user's machine — the web console refuses to render it
   * for exactly that reason), but `--git-url` on provision sets it to whatever
   * the user supplied, which per schema.prisma's `VibeGitProject.gitRemoteUrl`
   * comment may be a local path, `file://`, or a public https URL.
   */
  gitRemoteUrl: string | null;
  status: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The deprecated `repository` alias, which is NOT the full project.
 *
 * `VibeGitProjectEnvelopeSchema` declares it with `name`, `description` and
 * `defaultBranch` optional, and this file typed all three as required until the
 * conformance gate compared the two. Nothing crashed, because the printer reads
 * `data.gitProject ?? data.repository` and the canonical key is present on every
 * backend that still ships — but on the pre-decoupling response the fallback was the
 * only value available, and three fields it promised could be absent. A promise a
 * response cannot keep prints `undefined` and reads as a value.
 */
export type VibeGitProjectAliasDto = Omit<
  VibeGitProjectDto,
  "name" | "description" | "defaultBranch"
> &
  Partial<Pick<VibeGitProjectDto, "name" | "description" | "defaultBranch">>;

export interface SingleVibeGitProjectResponse {
  /** Canonical key; absent only on a pre-decoupling backend. */
  gitProject?: VibeGitProjectDto;
  /** Deprecated alias — always present, read as the fallback. */
  repository: VibeGitProjectAliasDto;
}

/**
 * The standalone git-project routes are greenfield — they postdate the
 * decoupling, so no pre-decoupling backend serves them and the deprecated
 * `repository` alias key never appears. `gitProject` is always present.
 */
export interface StandaloneVibeGitProjectResponse {
  gitProject: VibeGitProjectDto;
}

export interface ListVibeGitProjectsResponse {
  gitProjects: VibeGitProjectDto[];
}

/** Subset of VibeDeploymentSchema the CLI renders. */
/**
 * `POST /api/vibe/apps/:id/rollback` — the predecessor re-activated, and the
 * deployment it displaced. Both rows come back in full so the caller can name
 * the two versions without a second read.
 */
export interface RollbackAppResponse {
  restoredDeployment: VibeDeploymentDto;
  supersededDeployment: VibeDeploymentDto;
}

export interface VibeDeploymentDto {
  id: string;
  vibeAppId: string;
  color: string;
  /// User-facing monotonic version (`v{n}`). `color` is the internal
  /// blue/green slot and is no longer rendered.
  versionNumber: number;
  status: string;
  triggerSha: string;
  imageRef: string;
  /// The port the BUILD observed the image listening on. Null means NOT
  /// OBSERVED — the deploy then falls back to the platform default, so a null
  /// here and a `8080` here are different facts and must not render alike.
  detectedPort: number | null;
  forceRebuild: boolean;
  errorReason: string | null;
  createdAt: string;
}

/** Subset of VibeBuildJobSchema the CLI renders. */
export interface VibeBuildJobDto {
  id: string;
  vibeDeploymentId: string;
  status: string;
  /// Null until the executor reports which strategy it actually used.
  builder: string | null;
  logsRef: string;
  durationMs: number | null;
  errorReason: string | null;
  createdAt: string;
}

// Approvals — mirror packages/types/src/api/domains/vibe/schemas/
// approvals.schemas.ts. Full shape (matches VibeApprovalRequestSchema):
// the deploy trigger returns this same schema, so the deploy printer
// reads a subset of these fields.
//
// Pure type unions — the CLI never validates these against a string at
// runtime (status only ever arrives from the server; the decision kind
// comes from the --approve/--reject flags), so no runtime array is needed.
export type VibeApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
export type VibeApprovalDecisionKind = "APPROVE" | "REJECT";

export interface VibeApprovalRequestDto {
  id: string;
  vibeDeploymentId: string;
  organizationId: string;
  status: VibeApprovalRequestStatus;
  requiredApprovals: number;
  expiresAt: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VibeApprovalDecisionDto {
  id: string;
  vibeApprovalRequestId: string;
  organizationId: string;
  decision: VibeApprovalDecisionKind;
  decidedByUserId: string | null;
  note: string | null;
  decidedAt: string;
}

export interface GetApprovalResponse {
  request: VibeApprovalRequestDto;
  decisions: VibeApprovalDecisionDto[];
}

export interface RecordApprovalDecisionResponse {
  request: VibeApprovalRequestDto;
  decision: VibeApprovalDecisionDto;
}

export interface ListPendingApprovalsResponse {
  requests: VibeApprovalRequestDto[];
}

/**
 * Trigger response — discriminated on `status`, mirroring
 * `TriggerVibeDeploymentResponseSchema`. BOTH arms come back on a 2xx: an
 * org over its usage SOFT cap is ASKED whether to spend, never refused, so
 * `confirmation_required` is a normal success body and not an HTTP error.
 */
export type TriggerDeploymentResponse =
  | {
      /// `created` wrote a new deployment. `reused` found this app's newest
      /// deployment already in flight for the same commit and returned it
      /// untouched — nothing was written, not even a version number. Same
      /// fields either way, so a caller that only wants its deployment reads
      /// `.deployment` off both.
      status: "created" | "reused";
      deployment: VibeDeploymentDto;
      buildJob: VibeBuildJobDto;
      approvalRequest: VibeApprovalRequestDto | null;
    }
  | {
      status: "confirmation_required";
      reason: { costSafetyStatus: string; message: string };
    };

export interface ListDeploymentsResponse {
  deployments: VibeDeploymentDto[];
}

export interface GetDeploymentResponse {
  deployment: VibeDeploymentDto;
  buildJob: VibeBuildJobDto | null;
}

// Deploy state — mirrors packages/types/src/api/domains/vibe/schemas/
// deploy-state.schemas.ts. The one read that answers "did my push land, and is
// what I pushed what is live"; every field below is documented at length on the
// schema it copies, and the two that are easy to misread are re-documented here
// because this file is what the renderer reads.

/**
 * What became of a commit, as ONE value to branch on.
 *
 * A union rather than `string` because the renderer switches on it and the
 * compiler should refuse a missing arm. The renderer still carries a fallback
 * for an unrecognised value — a published binary routinely talks to a backend
 * newer than itself, and printing the raw word beats printing nothing.
 */
export type VibeDeployStateOutcome =
  | "DEPLOYED"
  | "RECEIVED_NOT_DEPLOYED"
  | "NOT_RECEIVED"
  | "REF_UNKNOWN"
  | "NO_REPOSITORY";

/** Which of the three ways of asking produced the commit under question. */
export type VibeDeployStateResolvedFrom = "sha" | "ref" | "deployBranch";

/** A branch or tag head as the platform recorded it — the receipt for a push. */
export interface VibeRefDto {
  id: string;
  vibeGitProjectId: string;
  organizationId: string;
  refName: string;
  sha: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The deployment in the live slot — the newest HEALTHY row.
 *
 * 🔴 HEALTHY is the ALLOCATION's verdict and lands BEFORE the edge swaps, so
 * this is not "what the URL returns". `servedProvenAt` is the only field that
 * speaks to that, and a `null` in it means NOT PROVEN, never "not serving".
 */
export interface VibeLiveDeploymentDto {
  deploymentId: string;
  versionNumber: number;
  commitSha: string;
  url: string | null;
  /** Non-null only when `served` below names THIS deployment. See its doc. */
  servedProvenAt: string | null;
  createdAt: string;
}

/**
 * What the edge was last OBSERVED answering with.
 *
 * 🔴 AN OBSERVATION, NOT A LIVE READING. Nothing re-checks it after it is
 * written, so `provenAt` is mandatory to render: a rollback, a teardown or a
 * newer deploy since that instant is not reflected here. Printing this object
 * without its age repeats — one layer up — the mistake of reading a healthy
 * deployment as a served one.
 */
export interface VibeServedArtifactDto {
  deploymentId: string;
  commitSha: string;
  imageRef: string;
  provenAt: string;
  healthyToServedMs: number;
}

export interface GetDeployStateResponse {
  outcome: VibeDeployStateOutcome;
  resolved: {
    sha: string | null;
    refName: string | null;
    from: VibeDeployStateResolvedFrom;
  };
  ref: VibeRefDto | null;
  deployment: VibeDeploymentDto | null;
  buildJob: VibeBuildJobDto | null;
  live: VibeLiveDeploymentDto | null;
  served: VibeServedArtifactDto | null;
}

// Env vars — mirror packages/types/src/api/domains/vibe/schemas/
// env-vars.schemas.ts. Scope + name shape are validated locally before
// the HTTP call so a typo surfaces without a round-trip; the backend's
// Zod boundary re-validates either way.
export const VIBE_ENV_VAR_SCOPES = ["ALL", "PROD", "STAGING"] as const;
export type VibeEnvVarScope = (typeof VIBE_ENV_VAR_SCOPES)[number];

export function isVibeEnvVarScope(v: string): v is VibeEnvVarScope {
  return (VIBE_ENV_VAR_SCOPES as readonly string[]).includes(v);
}

export interface VibeAppEnvVarDto {
  id: string;
  vibeAppId: string;
  organizationId: string;
  name: string;
  value: string;
  scope: VibeEnvVarScope;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Card bindings — mirror packages/types/src/api/domains/vibe/schemas/
// card-bindings.schemas.ts.

/**
 * How an imported access card is DELIVERED into the app's environment.
 * Mirrors the Prisma enum `VibeCardProjection`.
 *
 * Only `HANDLE` is selectable on the write path: the app reads an address and
 * the credential never enters its process. The other three name delivery paths
 * that do put material at or near the app, and each ships behind its own
 * enforcement — they are carried here so a row written by a newer backend
 * renders as a known name rather than an unrecognised string.
 */
export type VibeCardProjection = "HANDLE" | "SENTINEL" | "AMBIENT" | "LEASED_TOKEN";

/**
 * Whether the app may use the card RIGHT NOW.
 *
 * DERIVED server-side from the grant's status and the card's own lifecycle
 * columns, never stored, so this CLI does not re-derive "revoked" from a
 * timestamp and reach a different answer than the deployer does.
 *
 * Only `ACTIVE` projects. Every other value means the next deployment refuses
 * this entry and names it — which is why the status is a column and not a
 * detail behind `--json`.
 */
export type VibeCardBindingStatus =
  | "ACTIVE"
  | "PENDING_APPROVAL"
  | "PAUSED"
  | "REVOKED"
  | "EXPIRED";

/**
 * One access card imported into one app's environment under one NAME.
 *
 * READ-ONLY over this transport, by the route's shape rather than by a check:
 * importing a card delegates a human's credential authority, so the create /
 * update / delete routes accept no API key at all — and an API key is the only
 * credential this CLI holds. Cards are imported from the console; the CLI shows
 * what was imported, which is what a deployment will actually see.
 */
export interface VibeAppCardBindingDto {
  id: string;
  vibeAppId: string;
  organizationId: string;
  /** The environment variable name the app reads. Same grammar as a literal. */
  name: string;
  scope: VibeEnvVarScope;
  /**
   * `nxc_<grantId>` — the value the app reads out of its environment.
   *
   * An ADDRESS, not a bearer: presenting it proves nothing, because the broker
   * re-authorizes the calling app's own identity on every call. Printing it in
   * full is therefore safe, and is the point — it is exactly what the app sees.
   */
  handle: string;
  projection: VibeCardProjection;
  status: VibeCardBindingStatus;
  accessCardId: string;
  /** The card's name, as its owner wrote it. */
  accessCardName: string;
  /** The credential the card attenuates, so the reader knows whose authority this is. */
  credentialName: string;
  /** How many actions the card permits. A COUNT — never the policy itself. */
  allowedActionCount: number;
  /** The owner's daily tolerance and what is left of it. `null` = uncapped. */
  quotaPerDay: number | null;
  quotaRemaining: number | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListEnvVarsResponse {
  envVars: VibeAppEnvVarDto[];
  /**
   * Access cards imported into this app's environment.
   *
   * ABSENT — not empty — on a backend that predates card brokering, which is
   * why it is optional: this CLI ships standalone to npm and is routinely
   * pointed at a backend older than itself. Absent means "this server has
   * nothing to say about cards"; `[]` means "it does, and this app has none".
   * Rendering both as an empty section would assert the second when only the
   * first is true.
   */
  cardBindings?: VibeAppCardBindingDto[];
}

export interface UpsertEnvVarResponse {
  envVar: VibeAppEnvVarDto;
}

export interface DeleteEnvVarResponse {
  deletedId: string;
}

// Git credentials — mirror packages/types/src/api/domains/vibe/schemas/
// git-credentials.schemas.ts. The CLI ships standalone (`@nexus/types` is
// not a runtime dep); keep this in lockstep with the schema.
export interface VibeGitCredentialsDto {
  gitHostName: string;
  forgejoOrg: string;
  username: string;
  pushToken: string;
  cloneUrlBase: string;
}

export interface GetGitCredentialsResponse {
  credentials: VibeGitCredentialsDto;
}

// ============================================================
// Runtime logs — mirrors app-logs.schemas.ts (the page) and
// app-log-stream.schemas.ts (the follow).
// ============================================================

/**
 * The deployment slots a log line can carry, as they appear IN A LOG RECORD.
 *
 * Lower-case, and that is not a style choice: the database enum spells them
 * `BLUE` / `GREEN`, while the OTel resource attribute the log store indexes is
 * written `identity.color.toLowerCase()`. Sending the database spelling matches
 * nothing, silently. `vibe-wire-types.conformance.ts` pins these against
 * `VibeLogColorSchema`, which carries the same `satisfies` guard on the other
 * side of the wire.
 */
export const VIBE_LOG_COLORS = ["blue", "green"] as const;
export type VibeLogColor = (typeof VIBE_LOG_COLORS)[number];

export function isVibeLogColor(value: string): value is VibeLogColor {
  return (VIBE_LOG_COLORS as readonly string[]).includes(value);
}

/**
 * The server's own ceiling on lines per page.
 *
 * Mirrors `VIBE_LOG_GATEWAY_MAX_LIMIT`, and it is NOT the CLI's ceiling — see
 * `VIBE_LOG_CLI_MAX_LIMIT`, which is deliberately stricter. Declared here so the
 * conformance gate can prove the two numbers are the same one, and so the
 * comment above `VIBE_LOG_CLI_MAX_LIMIT` is checkable rather than assertive.
 */
export const VIBE_LOG_WIRE_MAX_LIMIT = 5000;

/** The server's ceiling on the `--grep` needle. Mirrors `VIBE_LOG_GATEWAY_MAX_CONTAINS_LENGTH`. */
export const VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH = 512;

/** One log line, as the tenant gateway rendered it. */
export interface VibeLogLineDto {
  /** The log store's own nanosecond epoch timestamp, verbatim. Doubles as the paging cursor. */
  timestampNs: string;
  /** The same instant as ISO 8601, so a reader never does nanosecond arithmetic. */
  timestamp: string;
  /** The line itself, exactly as the app emitted it. */
  message: string;
  /**
   * The deployment slot the line came from, when the record carries one.
   *
   * `string | null` rather than `VibeLogColor | null`, matching the wire: the
   * gateway relays whatever label the record holds, so narrowing it here would
   * be the CLI claiming a guarantee the producer does not make. A published
   * binary must not reject a value a newer platform starts emitting.
   */
  color: string | null;
}

/** One page of log lines, newest first, plus the cursor for the page before it. */
export interface GetVibeAppLogsResponse {
  lines: VibeLogLineDto[];
  /**
   * Pass as the next request's `cursor` to page further back, or `null` when
   * this page reached the start of the window.
   */
  nextCursor: string | null;
}

/**
 * A frame on the runtime-log SSE stream, as the CONSOLE-FACING wire spells it.
 *
 * Data-only: the discriminant is inside the JSON and there are no SSE `event:`
 * names to read. The tenant-facing wire between the gateway and the control
 * plane is a DIFFERENT format with named events and `id:` resume points, and the
 * CLI never sees it.
 *
 * `end` and `error` are both terminal and mutually exclusive — an `error` is
 * never followed by an `end`. A stream that stops with neither is a dropped
 * connection, which the follow driver reports rather than rendering as a quiet
 * end.
 */
export type VibeAppLogStreamFrame =
  | { type: "lines"; lines: VibeLogLineDto[] }
  | { type: "end"; reason: VibeAppLogStreamEndReason }
  | { type: "error"; message: string };

/**
 * Why a follow stopped.
 *
 * One value, and the honest count is one: the tenant gateway closes its side on
 * its own duration cap. Nothing is wrong and nothing was lost.
 */
export const VIBE_APP_LOG_STREAM_END_REASONS = ["upstream-closed"] as const;
export type VibeAppLogStreamEndReason = (typeof VIBE_APP_LOG_STREAM_END_REASONS)[number];
