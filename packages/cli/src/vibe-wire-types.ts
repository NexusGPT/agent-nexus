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
 *
 * debt: this module and `vibe-wire-types.conformance.ts` stay whole — nine
 *       surfaces that each measure under 150, not split, because
 *       `wire-types-bundle.test.ts` would make every piece carry an
 *       `@nexus/types` import it does not use. The root `eslint.config.js`
 *       carries the measurement, beside the refusal it explains. These two are
 *       NOT exempted there; an exemption is permanent and this block is not.
 *       Ceiling: no `max-lines` is armed on either; only their exact rows in
 *       `source-file-size.ledger.test.ts` hold them, so neither grows by a line
 *       without a raised number a reviewer sees.
 *       Upgrade trigger: that gate accepting a TRANSITIVE reach to the
 *       contract, or these gates acquiring a direct use of their own.
 */

import type { VibeApprovalRequestDto } from "./vibe-approval-wire-types";
import type {
  VibeDeployStateOutcome,
  VibeDeployStateResolvedFrom,
  VibeUnlistedValue
} from "./vibe-deploy-state-vocabulary";
import type { VibeBuildJobDto, VibeDeploymentDto } from "./vibe-deployment-wire-types";

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
 * How hard the server-side ship gate applies to an app's deploys. Mirrors
 * `VibeShipGateModeSchema` in
 * packages/types/src/shared/domain/vibe/ship-gate-mode.ts.
 *
 * THREE STATES, AND THE MIDDLE ONE IS THE REASON THIS TYPE EXISTS. `OFF` and
 * `ENFORCE` are what the older boolean `requireVerification` called `false` and
 * `true`. `WARN` is the on-ramp: the gate reads the repository, records what it
 * found, and the deploy ships anyway. It is the state an operator rolling gates
 * out across a fleet actually wants, and no boolean can express it — which is
 * why every CLI surface reads this field and not the boolean beside it.
 */
export type VibeShipGateMode = "OFF" | "WARN" | "ENFORCE";

/**
 * The compute an app's image builds on. Mirrors `VibeBuildComputeSizeSchema` in
 * packages/types/src/shared/domain/vibe/build-compute-size.ts. `MEDIUM` is
 * CodeBuild's 7 GB / 4 vCPU, `LARGE` its 15 GB / 8 vCPU and the default.
 */
export type VibeBuildComputeSize = "MEDIUM" | "LARGE";

/** Who may reach the app's public URL. Mirrors the Prisma enum `VibeAppVisibility`. */
export type VibeAppVisibility = "PRIVATE" | "PUBLIC";

/** What the tenant's edge last said about the app's public host. Mirrors `VibeAppEdgeReachability`. */
export type VibeAppEdgeReachability =
  | "ROUTED"
  | "UNROUTED"
  | "UNAVAILABLE"
  | "NO_SUCH_APP"
  | "UNKNOWN";

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
  /**
   * `shipGateMode === "ENFORCE"`, projected by the server for clients that
   * predate the mode. LOSSY BY CONSTRUCTION: `WARN` projects to `false`, so this
   * field cannot tell a warning app from an ungated one. Read `shipGateMode`.
   */
  requireVerification: boolean;
  /**
   * OPTIONAL because a backend one release behind this binary omits the key
   * entirely, and this CLI never runs the Zod schema that would default it. An
   * absent value is UNREPORTED, never `OFF` — printing the default here would
   * reproduce, one layer down, the exact defect that made this field render.
   */
  shipGateMode?: VibeShipGateMode | VibeUnlistedValue;
  deployBranch: string;
  resourceQuotas: { cpuMhz: number; memoryMiB: number; maxInstances: number };
  /**
   * The compute the app's image builds on, separate from `resourceQuotas`.
   * OPTIONAL for the reason `shipGateMode` is: a backend one release behind
   * omits it, and absent is UNREPORTED, never `LARGE`.
   */
  buildComputeSize?: VibeBuildComputeSize | VibeUnlistedValue;
  healthCheckConfig: Record<string, unknown>;
  publicUrl: string | null;
  visibility: VibeAppVisibility | VibeUnlistedValue;
  /**
   * What the tenant's edge last said about this app's public host. `null` means
   * NEVER OBSERVED — the probe only asks about a healthy, settled deployment —
   * and must never be printed as if it meant healthy.
   */
  edgeReachability: VibeAppEdgeReachability | VibeUnlistedValue | null;
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
  deployability: VibeAppDeployability | VibeUnlistedValue;
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
   * "Git URL": a user's push remote comes from
   * `nexus apps git-credentials <projectId>`, whose `cloneUrl` is the public
   * `https://git.<tenant>.<domain>/<org>/<name>.git`.
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

/**
 * `POST /api/vibe/apps/:id/rollback` — the predecessor re-activated, and the
 * deployment it displaced. Both rows come back in full so the caller can name
 * the two versions without a second read.
 */
export interface RollbackAppResponse {
  restoredDeployment: VibeDeploymentDto;
  supersededDeployment: VibeDeploymentDto;
}

/**
 * `POST /api/vibe/apps/:appId/deployments/:deploymentId/cancel` — discriminated
 * on `outcome`, mirroring `CancelVibeDeploymentBuildResponseSchema`. Both arms
 * are a 2xx: `already_ended` means there was nothing to stop and nothing was
 * written, and it carries the rows as they stand so the caller can say what
 * actually became of the build.
 */
export type CancelDeploymentBuildResponse =
  | { outcome: "cancelled"; deployment: VibeDeploymentDto; buildJob: VibeBuildJobDto }
  | { outcome: "already_ended"; deployment: VibeDeploymentDto; buildJob: VibeBuildJobDto | null };

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

/** `outcome` and `resolved.from` can carry a value this binary does not list — see `VibeUnlistedValue`. */
export interface GetDeployStateResponse {
  outcome: VibeDeployStateOutcome | VibeUnlistedValue;
  resolved: {
    sha: string | null;
    refName: string | null;
    from: VibeDeployStateResolvedFrom | VibeUnlistedValue;
  };
  ref: VibeRefDto | null;
  deployment: VibeDeploymentDto | null;
  buildJob: VibeBuildJobDto | null;
  live: VibeLiveDeploymentDto | null;
  served: VibeServedArtifactDto | null;
}

// Per-project git credential (`VibeGitProjectCredentialsSchema`), pinned by the conformance file.
export interface VibeGitProjectCredentialsDto {
  gitProjectId: string;
  gitProjectName: string;
  gitHostName: string;
  forgejoOrg: string;
  username: string;
  pushToken: string;
  cloneUrl: string;
}

export interface GetGitProjectCredentialsResponse {
  credentials: VibeGitProjectCredentialsDto;
}

// Logs and the environment live in their own modules; re-exported so import sites are unchanged.
export * from "./vibe-env-wire-types";
export * from "./vibe-log-wire-types";
