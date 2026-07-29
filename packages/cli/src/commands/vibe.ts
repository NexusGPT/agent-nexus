/**
 * `nexus vibe …` — tenant-scoped Vibe (Nexus Git + internal deployment
 * platform) commands. Authenticate with the org API key, same as the
 * rest of the tenant CLI.
 *
 * v1 scope: `audit list` (read the per-org audit feed), the `app` group
 * (create / list / get / update / delete / visibility / edge-token /
 * rotate-edge-token / register-as-tool), the `git-project` group (create /
 * list / get / reprovision / delete), `deploy` (trigger a deployment), and the
 * `deployments` group (list / get). Approval / template commands land in later
 * slices.
 *
 * Wire transport detour: these commands use `tenantRequest` (api-key
 * auth + absolute path) instead of the SDK's `createClient`, which
 * hardcodes the `/api/public/v1` prefix. `audit list` hits the
 * `/api/vibe/...` tenant surface; `app register-as-tool` hits the
 * public-v1 bridge at `/api/public/v1/vibe/...` — both authenticate
 * with the same `api-key` header, so one util serves both. See
 * `util/tenant-http.ts` for the full rationale.
 */

import { readFileSync } from "node:fs";

import { NexusApiError } from "@agent-nexus/sdk";
import { Command } from "commander";

import { handleError } from "../errors";
import { color, isJsonMode, printPaginationMeta, printRecord, printTable } from "../output";
import { type TenantHttpOptions, tenantRequest } from "../util/tenant-http";
import {
  isVibeAllowedRegion,
  VIBE_ALLOWED_REGIONS,
  type VibeTenantClusterStatus
} from "../vibe-regions";
import { reportWatchOutcome, WATCH_DEFAULTS, watchDeployment } from "./vibe-watch";

// ============================================================
// Wire types — mirror packages/types/src/api/domains/vibe/schemas/
// audit-events.schemas.ts. The CLI is published as a standalone npm
// package; `@nexus/types` isn't a runtime dep. Keep these in lockstep
// when the schema evolves.
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
const VIBE_DEFAULT_CONTAINER_PORT = 8080;

const AUDIT_EVENT_TYPES = [
  "DEPLOYMENT_TRIGGERED",
  "DEPLOYMENT_APPROVED",
  "DEPLOYMENT_REJECTED",
  "APPROVAL_EXPIRED",
  "COST_SAFETY_AUTO_SUSPENDED",
  "DEPLOYMENT_ROLLED_BACK_COST_SAFETY"
] as const;
type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

function isAuditEventType(v: string): v is AuditEventType {
  return (AUDIT_EVENT_TYPES as readonly string[]).includes(v);
}

interface AuditPayloadDeploymentTriggered {
  eventType: "DEPLOYMENT_TRIGGERED";
  vibeDeploymentId: string;
  triggerSha: string;
  approvalGated: boolean;
}
interface AuditPayloadApprovalDecision {
  eventType: "DEPLOYMENT_APPROVED" | "DEPLOYMENT_REJECTED";
  vibeApprovalRequestId: string;
  vibeDeploymentId: string;
  deciderUserId: string;
  decisive: boolean;
  note: string | null;
}
interface AuditPayloadApprovalExpired {
  eventType: "APPROVAL_EXPIRED";
  vibeApprovalRequestId: string;
  vibeDeploymentId: string;
}
interface AuditPayloadCostSafetyAutoSuspended {
  eventType: "COST_SAFETY_AUTO_SUSPENDED";
  usageType: "VIBE_COMPUTE_MIN" | "VIBE_BUILD_MIN" | "VIBE_EGRESS_MB";
  breachedSum: number;
  effectiveCap: number;
  billingPeriod: string;
}
interface AuditPayloadDeploymentRolledBack {
  eventType: "DEPLOYMENT_ROLLED_BACK_COST_SAFETY";
  vibeDeploymentId: string;
  priorStatus: "BUILDING" | "AWAITING_APPROVAL" | "DEPLOYING" | "HEALTHY";
  triggerSha: string;
  suspendedReason: string | null;
}

type AuditPayload =
  | AuditPayloadDeploymentTriggered
  | AuditPayloadApprovalDecision
  | AuditPayloadApprovalExpired
  | AuditPayloadCostSafetyAutoSuspended
  | AuditPayloadDeploymentRolledBack;

interface VibeAuditEvent {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  vibeAppId: string | null;
  payload: AuditPayload;
  createdAt: string;
}

interface ListAuditEventsResponse {
  events: VibeAuditEvent[];
  nextCursor: string | null;
}

/**
 * The registered-tool detail returned by the register-as-tool bridge.
 * Mirrors `ExternalToolDetailSchema` in
 * packages/types/src/api/public/v1/schemas/skills.schemas.ts.
 */
interface ExternalToolDetail {
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
interface VibeAppDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  requireApprovals: boolean;
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

interface ListVibeAppsResponse {
  apps: VibeAppDto[];
}

interface SingleVibeAppResponse {
  app: VibeAppDto;
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
interface VibeEdgeTokenDto {
  token: string;
  /** The header the edge matches the token against (`X-Vibe-App-Token`). */
  headerName: string;
  /** The app's canonical public URL. Null only for pre-canonical-URL rows. */
  publicUrl: string | null;
}

interface SetVisibilityResponse {
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

interface GetEdgeTokenResponse {
  edgeToken: VibeEdgeTokenDto;
}

interface RotateEdgeTokenResponse {
  edgeToken: VibeEdgeTokenDto;
  /**
   * True when the app is registered as an agent tool. Rotating invalidates the
   * token baked into that tool's auth, so it must be re-registered or it starts
   * 404-ing at the edge.
   */
  toolResyncRequired: boolean;
}

/** Both delete routes answer with the id they removed. */
interface DeletedIdResponse {
  deletedId: string;
}

/** Subset of VibeGitProjectSchema the CLI renders. */
interface VibeGitProjectDto {
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

interface SingleVibeGitProjectResponse {
  /** Canonical key; absent only on a pre-decoupling backend. */
  gitProject?: VibeGitProjectDto;
  /** Deprecated alias — always present, read as the fallback. */
  repository: VibeGitProjectDto;
}

/**
 * The standalone git-project routes are greenfield — they postdate the
 * decoupling, so no pre-decoupling backend serves them and the deprecated
 * `repository` alias key never appears. `gitProject` is always present.
 */
interface StandaloneVibeGitProjectResponse {
  gitProject: VibeGitProjectDto;
}

interface ListVibeGitProjectsResponse {
  gitProjects: VibeGitProjectDto[];
}

/** Subset of VibeDeploymentSchema the CLI renders. */
/**
 * `POST /api/vibe/apps/:id/rollback` — the predecessor re-activated, and the
 * deployment it displaced. Both rows come back in full so the caller can name
 * the two versions without a second read.
 */
interface RollbackAppResponse {
  restoredDeployment: VibeDeploymentDto;
  supersededDeployment: VibeDeploymentDto;
}

interface VibeDeploymentDto {
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
interface VibeBuildJobDto {
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
type VibeApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
type VibeApprovalDecisionKind = "APPROVE" | "REJECT";

interface VibeApprovalRequestDto {
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

interface VibeApprovalDecisionDto {
  id: string;
  vibeApprovalRequestId: string;
  organizationId: string;
  decision: VibeApprovalDecisionKind;
  decidedByUserId: string | null;
  note: string | null;
  decidedAt: string;
}

interface GetApprovalResponse {
  request: VibeApprovalRequestDto;
  decisions: VibeApprovalDecisionDto[];
}

interface RecordApprovalDecisionResponse {
  request: VibeApprovalRequestDto;
  decision: VibeApprovalDecisionDto;
}

interface ListPendingApprovalsResponse {
  requests: VibeApprovalRequestDto[];
}

/**
 * Trigger response — discriminated on `status`, mirroring
 * `TriggerVibeDeploymentResponseSchema`. BOTH arms come back on a 2xx: an
 * org over its usage SOFT cap is ASKED whether to spend, never refused, so
 * `confirmation_required` is a normal success body and not an HTTP error.
 */
type TriggerDeploymentResponse =
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

interface ListDeploymentsResponse {
  deployments: VibeDeploymentDto[];
}

interface GetDeploymentResponse {
  deployment: VibeDeploymentDto;
  buildJob: VibeBuildJobDto | null;
}

// Env vars — mirror packages/types/src/api/domains/vibe/schemas/
// env-vars.schemas.ts. Scope + name shape are validated locally before
// the HTTP call so a typo surfaces without a round-trip; the backend's
// Zod boundary re-validates either way.
const VIBE_ENV_VAR_SCOPES = ["ALL", "PROD", "STAGING"] as const;
type VibeEnvVarScope = (typeof VIBE_ENV_VAR_SCOPES)[number];

function isVibeEnvVarScope(v: string): v is VibeEnvVarScope {
  return (VIBE_ENV_VAR_SCOPES as readonly string[]).includes(v);
}

interface VibeAppEnvVarDto {
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

interface ListEnvVarsResponse {
  envVars: VibeAppEnvVarDto[];
}

interface UpsertEnvVarResponse {
  envVar: VibeAppEnvVarDto;
}

interface DeleteEnvVarResponse {
  deletedId: string;
}

// Git credentials — mirror packages/types/src/api/domains/vibe/schemas/
// git-credentials.schemas.ts. The CLI ships standalone (`@nexus/types` is
// not a runtime dep); keep this in lockstep with the schema.
interface VibeGitCredentialsDto {
  gitHostName: string;
  forgejoOrg: string;
  username: string;
  pushToken: string;
  cloneUrlBase: string;
}

interface GetGitCredentialsResponse {
  credentials: VibeGitCredentialsDto;
}

// ============================================================
// Root vibe command + audit subcommand registration
// ============================================================

export function registerVibeCommands(program: Command): void {
  const vibe = program
    .command("vibe")
    .description("Nexus Git + internal deployment platform (Vibe)")
    .addHelpText(
      "after",
      `
Subcommands:
  cluster          Provision / inspect your org's dedicated Vibe cluster.
  app              Manage Vibe apps — create, list, get, update, register as a tool.
  git-project      Manage git projects — the standalone code store apps deploy from.
  git-credentials  Fetch your tenant git push token + clone address.
  deploy           Trigger a deployment for an app from a commit sha.
  rollback         Roll an app back to its previous healthy version.
  deployments      List / inspect an app's deployments and their build jobs.
  env              Manage an app's plaintext env vars — list, set, remove.
  approvals        Review gated deployments — pending queue, get, approve/reject.
  audit            Inspect the per-org Vibe audit feed (deployments, approvals,
                   cost-safety state changes, rollbacks).

This surface is feature-flagged — your org must have the VIBE feature
flag enabled. If you get a 403, ping platform-ops to flip the flag.
`
    );

  registerClusterCommands(vibe, program);
  registerAppCommands(vibe, program);
  registerGitProjectCommands(vibe, program);
  registerGitCredentialsCommand(vibe, program);
  registerDeployCommand(vibe, program);
  registerRollbackCommand(vibe, program);
  registerDeploymentsCommands(vibe, program);
  registerEnvCommands(vibe, program);
  registerApprovalsCommands(vibe, program);
  registerAuditCommands(vibe, program);
}

// ============================================================
// vibe cluster
// ============================================================

/** The cluster health the GET surface reports. `null` cluster = none provisioned. */
interface VibeClusterHealthDto {
  status: VibeTenantClusterStatus;
  statusReason: string | null;
  gitHostStatus: string | null;
  telemetryStatus: string | null;
}

interface GetVibeClusterResponse {
  cluster: VibeClusterHealthDto | null;
}

/** Discriminated outcome of an org's own opt-in. Mirrors the operator surface's. */
type ProvisionVibeClusterOutcome =
  | { kind: "provisioning"; reprovisioned: boolean }
  | { kind: "already_active"; status: VibeTenantClusterStatus };

interface ProvisionVibeClusterResponse {
  outcome: ProvisionVibeClusterOutcome;
}

/**
 * An org's own cluster surface. The same two endpoints the console banner
 * drives, so a terminal never has to become a browser to get unblocked — the
 * operator path (`nexus admin vibe-tenant-cluster`) acts on ANOTHER org and is
 * not what a tenant reaches for.
 */
function registerClusterCommands(vibe: Command, program: Command): void {
  const cluster = vibe
    .command("cluster")
    .description("Provision / inspect your org's dedicated Vibe cluster");

  cluster
    .command("status")
    .description("Show your org's dedicated cluster, or that it has none")
    .addHelpText(
      "after",
      `
No cluster is not an error: apps still build and deploy on shared
infrastructure, and a git project created with --git-url needs no cluster
at all. A cluster is what lets Nexus HOST your code (the tenant git host)
and hold your secrets.

Examples:
  $ nexus vibe cluster status
  $ nexus vibe cluster status --json
`
    )
    .action(async () => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetVibeClusterResponse>(opts, {
          method: "GET",
          path: "/api/vibe/cluster"
        });
        printVibeCluster(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  cluster
    .command("provision")
    .description("Provision your org's dedicated cluster (EU regions only — RGPD)")
    .requiredOption(
      "--region <region>",
      `Region the cluster lands in. EU only: ${VIBE_ALLOWED_REGIONS.join(", ")}.`
    )
    .addHelpText(
      "after",
      `
The region is IMMUTABLE for the cluster's lifetime — relocating means a
full teardown and re-provision — so it is required rather than defaulted.
Pick for data residency first; all choices are EU (RGPD).

Provisioning is declarative and asynchronous: this records the intent and
returns immediately, then the cluster converges on its own (typically tens
of minutes). You do not need to wait — a git project created meanwhile is
accepted and materializes once the cluster is up. Poll with
"nexus vibe cluster status".

Idempotent: running it again while PROVISIONING, or against a cluster
that is already live, reports the current state instead of erroring.

Examples:
  $ nexus vibe cluster provision --region eu-west-3
  $ nexus vibe cluster provision --region eu-central-1 --json
`
    )
    .action(async (cmdOpts: { region: string }) => {
      try {
        const region = cmdOpts.region.trim();
        // Rejected locally so a typo costs no round-trip; the backend's Zod
        // boundary is the actual enforcement point and rejects it too.
        if (!isVibeAllowedRegion(region)) {
          throw new Error(
            `Invalid --region "${cmdOpts.region}". EU regions only (RGPD): ${VIBE_ALLOWED_REGIONS.join(", ")}.`
          );
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ProvisionVibeClusterResponse>(opts, {
          method: "POST",
          path: "/api/vibe/cluster/provision",
          body: { region }
        });
        printProvisionOutcome(data.outcome, region);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

function printVibeCluster(data: GetVibeClusterResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.cluster === null) {
    console.log(color.dim("No dedicated cluster."));
    console.log(
      color.dim(
        "Apps still build and deploy on shared infrastructure. Provision one to have\nNexus host your code: nexus vibe cluster provision --region <region>"
      )
    );
    return;
  }
  printRecord({
    Status: data.cluster.status,
    Reason: data.cluster.statusReason ?? color.dim("—"),
    "Git host": data.cluster.gitHostStatus ?? color.dim("not reported yet"),
    Telemetry: data.cluster.telemetryStatus ?? color.dim("not reported yet")
  });
}

/**
 * What to do about a cluster that provision declined to touch.
 *
 * A `Record` over every status, so a new one is a compile error rather than
 * silently inheriting advice written for a different state. Not all of these
 * reach `already_active` today (the server handles absent / PROVISIONING /
 * retired before it gets here) — but which ones do is the SERVER's business,
 * and "nothing to do" is wrong for a cluster mid-teardown: that one needs a
 * re-run once it lands, not a shrug.
 */
const ALREADY_ACTIVE_ADVICE: Record<VibeTenantClusterStatus, string> = {
  HEALTHY: "Nothing to do — it is serving.",
  UPDATING: "It is converging; nothing to do.",
  DEGRADED: "It is up but drifted, and converges on its own. Check: nexus vibe cluster status",
  DISABLING: "It is being torn down. Wait for it to finish, then run this again to revive it.",
  DESTROYING: "It is being destroyed. Wait for it to finish, then run this again for a fresh one.",
  PROVISIONING: "It is already being provisioned — poll with: nexus vibe cluster status",
  DISABLED_RETAINED: "It is disabled. Running this again revives it in place.",
  DESTROYED: "It is destroyed. Running this again provisions a fresh one."
};

function printProvisionOutcome(outcome: ProvisionVibeClusterOutcome, region: string): void {
  if (isJsonMode()) {
    console.log(JSON.stringify({ outcome }, null, 2));
    return;
  }
  // Exhaustive over the outcome union: a new kind is a compile error here
  // rather than a silent "provisioned!" for something that did not happen.
  switch (outcome.kind) {
    case "provisioning":
      console.log(
        outcome.reprovisioned
          ? `Re-provisioning your retired cluster in ${region}.`
          : `Provisioning your cluster in ${region}.`
      );
      console.log(color.dim("It converges on its own — poll with: nexus vibe cluster status"));
      return;
    case "already_active":
      console.log(`Your cluster is already ${outcome.status}.`);
      console.log(color.dim(ALREADY_ACTIVE_ADVICE[outcome.status]));
      return;
    default: {
      const exhaustive: never = outcome;
      void exhaustive;
    }
  }
}

// ============================================================
// vibe deployments
// ============================================================

function registerDeploymentsCommands(vibe: Command, program: Command): void {
  const deployments = vibe.command("deployments").description("Inspect an app's deployments");

  deployments
    .command("list <appId>")
    .description("List an app's deployments, newest-first")
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListDeploymentsResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments`
        });
        printDeploymentList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  deployments
    .command("get <appId> <deploymentId>")
    .description("Show one deployment with its build job")
    .action(async (appId: string, deploymentId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetDeploymentResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}`
        });
        printDeploymentDetail(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

// ============================================================
// vibe env
// ============================================================

function registerEnvCommands(vibe: Command, program: Command): void {
  const env = vibe.command("env").description("Manage an app's plaintext env vars");

  env
    .command("list <appId>")
    .description("List an app's env vars (all scopes), ordered by scope then name")
    .addHelpText(
      "after",
      `
Values are plaintext — secrets do NOT belong here (a separate secret-ref
surface lands with the Vault wiring). Long values are truncated in the
table; use --json for the full value.

Examples:
  $ nexus vibe env list 11111111-2222-4333-8444-555555555555
  $ nexus vibe env list 11111111-2222-4333-8444-555555555555 --json | jq '.envVars[].name'
`
    )
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListEnvVarsResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/env`
        });
        printEnvVarList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  env
    .command("set <appId> <assignment>")
    .description("Set (upsert) an env var, given as NAME=VALUE")
    .option("--scope <scope>", `Scope: ${VIBE_ENV_VAR_SCOPES.join(", ")}. Default ALL.`)
    .addHelpText(
      "after",
      `
Upsert semantics: a fresh (scope, NAME) is created, an existing one is
overwritten. NAME must be SCREAMING_SNAKE_CASE (A-Z, 0-9, underscore).
The value is everything after the first '=', so it may itself contain
'=' and may be empty (NAME= sets an empty value).

Examples:
  $ nexus vibe env set 11111111-2222-4333-8444-555555555555 LOG_LEVEL=debug
  $ nexus vibe env set 11111111-2222-4333-8444-555555555555 DATABASE_URL=postgres://… --scope PROD
  $ nexus vibe env set 11111111-2222-4333-8444-555555555555 FEATURE_OFF=
`
    )
    .action(async (appId: string, assignment: string, cmdOpts: { scope?: string }) => {
      try {
        const { name, value } = parseEnvAssignment(assignment);
        const scope = resolveEnvScope(cmdOpts.scope);
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<UpsertEnvVarResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/env`,
          body: scope ? { name, value, scope } : { name, value }
        });
        printEnvVar(data.envVar);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  env
    .command("rm <appId> <envVarId>")
    .description("Remove an env var by id (find the id via `nexus vibe env list`)")
    .addHelpText(
      "after",
      `
Removal is by env-var id, not name — list first to get the id. Scoped to
your org + the named app; a wrong id returns 404.

Examples:
  $ nexus vibe env rm 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa
`
    )
    .action(async (appId: string, envVarId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<DeleteEnvVarResponse>(opts, {
          method: "DELETE",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/env/${encodeURIComponent(envVarId)}`
        });
        printEnvVarDeleted(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

// ============================================================
// vibe approvals
// ============================================================

function registerApprovalsCommands(vibe: Command, program: Command): void {
  const approvals = vibe.command("approvals").description("Review gated deployments");

  approvals
    .command("pending")
    .description("List PENDING approval requests across the org, oldest-first")
    .addHelpText(
      "after",
      `
The reviewer queue — every deployment waiting on an approval gate, across
all apps in your org. Decide one with \`nexus vibe approvals decide\`.

Examples:
  $ nexus vibe approvals pending
  $ nexus vibe approvals pending --json | jq '.requests[].vibeDeploymentId'
`
    )
    .action(async () => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListPendingApprovalsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/approvals/pending"
        });
        printApprovalRequestList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  approvals
    .command("get <appId> <deploymentId>")
    .description("Show a deployment's approval request with its decisions")
    .addHelpText(
      "after",
      `
Returns 404 when the deployment is ungated (no approval gate) or not in
your org.

Examples:
  $ nexus vibe approvals get 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa
`
    )
    .action(async (appId: string, deploymentId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetApprovalResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}/approval`
        });
        printApprovalWithDecisions(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  approvals
    .command("decide <appId> <deploymentId>")
    .description("Record an APPROVE or REJECT decision on a gated deployment")
    .option("--approve", "Approve the deployment.")
    .option("--reject", "Reject the deployment.")
    .option("--note <text>", "Optional reviewer note (≤ 2 KB).")
    .addHelpText(
      "after",
      `
Pass exactly one of --approve / --reject. You cannot decide your own
deployment (403); a duplicate or already-decided/expired request is 409.

Examples:
  $ nexus vibe approvals decide 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa --approve
  $ nexus vibe approvals decide 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa --reject --note "needs a migration first"
`
    )
    .action(
      async (
        appId: string,
        deploymentId: string,
        cmdOpts: { approve?: boolean; reject?: boolean; note?: string }
      ) => {
        try {
          const decision = resolveDecision(cmdOpts);
          const note = cmdOpts.note?.trim();
          const opts = resolveTenantOpts(program);
          const data = await tenantRequest<RecordApprovalDecisionResponse>(opts, {
            method: "POST",
            path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}/approval/decisions`,
            body: note ? { decision, note } : { decision }
          });
          printDecisionResult(data);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
}

/**
 * Resolve the mutually-exclusive --approve / --reject flags to the wire
 * decision kind. Exactly one is required — reject zero or both locally
 * before the round-trip.
 */
function resolveDecision(cmdOpts: {
  approve?: boolean;
  reject?: boolean;
}): VibeApprovalDecisionKind {
  if (cmdOpts.approve && cmdOpts.reject) {
    throw new Error("Pass only one of --approve / --reject, not both.");
  }
  if (cmdOpts.approve) return "APPROVE";
  if (cmdOpts.reject) return "REJECT";
  throw new Error("A decision is required. Pass --approve or --reject.");
}

// ============================================================
// vibe git-credentials
// ============================================================

function registerGitCredentialsCommand(vibe: Command, program: Command): void {
  vibe
    .command("git-credentials")
    .description("Fetch your org's git push token + tenant git host address")
    .addHelpText(
      "after",
      `
The last brick of self-service: returns the push token + clone address for
your tenant's git host, so you can push code with no manual admin step.
Org-scoped — the credential is your own (your org API key authenticates).

Push a repo (the repo name is your Vibe app's repo on the host). --json
prints the credential fields at the top level:
  $ creds=$(nexus vibe git-credentials --json)
  $ base=$(echo "$creds" | jq -r '.cloneUrlBase')
  $ user=$(echo "$creds" | jq -r '.username')
  $ tok=$(echo "$creds" | jq -r '.pushToken')
  $ host="\${base#https://}"
  $ git push "https://$user:$tok@\${host}<repo>.git" HEAD:main

The pushToken is a LIVE SECRET — it grants git push to your repos. Treat the
whole payload as sensitive (don't paste it into shared logs).

Returns 404 if your org has no dedicated git host, 409 if the host has not
finished provisioning yet (retry shortly).

Examples:
  $ nexus vibe git-credentials
  $ nexus vibe git-credentials --json | jq -r '.cloneUrlBase'
`
    )
    .action(async () => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetGitCredentialsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/git-credentials"
        });
        printGitCredentials(data.credentials);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

/**
 * Render the served git credential. In --json mode the credential object is
 * printed verbatim. In human mode we print the addressing fields plus a
 * ready-to-use authenticated remote base (`https://user:token@host/org/`) —
 * the token IS surfaced here on purpose; that is the command's whole job.
 */
function printGitCredentials(creds: VibeGitCredentialsDto): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(creds, null, 2));
    return;
  }

  const host = creds.cloneUrlBase.replace(/^https:\/\//, "");
  const authedBase = `https://${creds.username}:${creds.pushToken}@${host}`;

  printRecord(creds as unknown as Record<string, unknown>, [
    { key: "gitHostName", label: "Git host" },
    { key: "forgejoOrg", label: "Org" },
    { key: "username", label: "Username" },
    { key: "pushToken", label: "Push token" },
    { key: "cloneUrlBase", label: "Clone base" }
  ]);
  console.log("");
  console.log(`${color.dim("Authenticated remote base (append <repo>.git):")}`);
  console.log(`  ${authedBase}`);
  console.log(color.dim("The push token is a live secret — keep it out of shared logs."));
}

// ============================================================
// vibe deploy
// ============================================================

function registerDeployCommand(vibe: Command, program: Command): void {
  vibe
    .command("deploy <appId>")
    .description("Trigger a deployment for an app from a commit sha")
    .requiredOption("--sha <sha>", "Commit sha to deploy (7–40 hex chars).")
    .option(
      "--confirm-overage",
      "Confirm upfront that the deploy may exceed the org's usage soft limit."
    )
    .option("--watch", "Block until the deployment is healthy AND served, then exit 0.")
    .option(
      "--force-rebuild",
      "Build this sha again instead of reusing the image already in the registry."
    )
    .addHelpText(
      "after",
      `
Triggers one push→build→deploy attempt: the deployment lands in BUILDING
and its sibling build job in PENDING; the build + deploy runners carry it
forward asynchronously. If the app has approvals enabled, the deploy waits
in AWAITING_APPROVAL until a reviewer decides.

Usage soft limit: if the org is over its Vibe usage cap for the current
billing period, the deploy is not refused — it ASKS. Interactively you get
a y/N prompt; non-interactively nothing is deployed and the command exits
non-zero, printing the exact --confirm-overage re-run. Pass
--confirm-overage upfront to answer the question in advance. It does NOT
bypass an admin suspension, which still fails with 403.

--watch blocks until the deployment reaches a terminal state and then
until the tenant's edge confirms the app is actually being SERVED. It
exits 0 for that outcome and NOTHING else, so a script can branch on the
exit code alone. In particular it does not exit 0 on HEALTHY: that is a
verdict from a check against the container's own port, which never
crosses the edge, so an app can be HEALTHY and unreachable.

--force-rebuild builds the sha again rather than deploying the image the
registry already holds for it. The registry is immutable and the tag comes
from the commit, so ordinarily the FIRST build of a sha is the image that
sha will ever have — which makes a redeploy free, and made a sha built
badly once impossible to correct without an empty commit. Use it after a
builder or base-image fix; it costs a full build, so it is not the default.

Examples:
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4d…full40
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --confirm-overage
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --watch
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --force-rebuild
`
    )
    .action(
      async (
        appId: string,
        cmdOpts: { sha: string; confirmOverage?: boolean; watch?: boolean; forceRebuild?: boolean }
      ) => {
        try {
          const triggerSha = resolveTriggerSha(cmdOpts.sha);
          const opts = resolveTenantOpts(program);

          const data = await triggerDeploymentAnsweringOverage(
            opts,
            appId,
            triggerSha,
            // The hint has to name the command the operator actually ran. A
            // re-run that silently drops --force-rebuild would deploy the
            // reused image they asked to replace and look like it worked.
            `nexus vibe deploy ${appId} --sha ${cmdOpts.sha}` +
              `${cmdOpts.forceRebuild === true ? " --force-rebuild" : ""} --confirm-overage`,
            cmdOpts.confirmOverage === true,
            cmdOpts.forceRebuild === true
          );
          // Nothing was created — declined, no TTY to ask, or the org's state
          // moved mid-flight. Nothing to watch, and it must not exit clean.
          if (data === null) {
            process.exitCode = 1;
            return;
          }

          // In --json a watched run prints exactly ONE document, and it is the
          // watch outcome. Printing the trigger as well would put two documents
          // on one stream, which no JSON consumer can read. Human output still
          // shows both: there the trigger line is progress, not a parsed value.
          const watching = cmdOpts.watch === true;
          if (!watching || !isJsonMode()) printTriggeredDeployment(data, appId);

          if (watching) {
            process.exitCode = await runDeploymentWatch(program, appId, data.deployment.id);
          }
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
}

/**
 * Drive {@link watchDeployment} against the live API and render the result.
 * Shared by `deploy --watch` and `rollback --watch` — they watch the same thing
 * (one deployment becoming the served version), so they must agree on what
 * counts as success down to the exit code.
 */
async function runDeploymentWatch(
  program: Command,
  appId: string,
  deploymentId: string
): Promise<number> {
  const opts = resolveTenantOpts(program);
  const outcome = await watchDeployment(
    {
      readDeployment: async () => {
        const data = await tenantRequest<GetDeploymentResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}`
        });
        return data.deployment;
      },
      readApp: async () => {
        const data = await tenantRequest<SingleVibeAppResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}`
        });
        return data.app;
      },
      // 404 here means the deployment is UNGATED — the endpoint answers 404 for
      // "no approval request", which is a fact, not a failure. Any other error
      // propagates: a watch that silently treats a broken read as "no gate"
      // would wait out a rejection it could have reported.
      readApproval: async () => {
        try {
          const data = await tenantRequest<GetApprovalResponse>(opts, {
            method: "GET",
            path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}/approval`
          });
          return { status: data.request.status };
        } catch (err) {
          if (err instanceof NexusApiError && err.status === 404) return null;
          throw err;
        }
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now()
    },
    WATCH_DEFAULTS,
    // Progress goes to STDERR so `--json` stdout stays a single parseable
    // document; a watch that interleaves status lines into it is unpipeable.
    (status) => {
      if (!isJsonMode()) console.error(color.dim(`  … ${status}`));
    }
  );
  return reportWatchOutcome(outcome, appId);
}

// ============================================================
// vibe rollback
// ============================================================

function registerRollbackCommand(vibe: Command, program: Command): void {
  vibe
    .command("rollback <appId>")
    .description("Roll an app back to its previous healthy version")
    .option("--to <sha>", "Redeploy this specific commit sha instead of the previous version.")
    .option(
      "--confirm-overage",
      "Only with --to: confirm the redeploy may exceed the org's usage soft limit."
    )
    .option("--watch", "Block until the restored version is healthy AND served, then exit 0.")
    .addHelpText(
      "after",
      `
Without --to this is NON-DESTRUCTIVE and deletes nothing: the server
re-activates the app's previous SUPERSEDED deployment and its retained
image in one atomic transaction, onto the slot opposite the current one.
The version serving now keeps every request until the restored one is
healthy, so availability never regresses.

409 means there is nothing to roll back to — no live version, no previous
version, or a deploy already in flight.

--to <sha> is a different operation wearing the same name, and is offered
because it is what you reach for when the previous version is ALSO bad:
it triggers an ordinary build+deploy of that sha, exactly like
\`deploy --sha\`. It is not atomic and it rebuilds.

Examples:
  $ nexus vibe rollback 11111111-2222-4333-8444-555555555555
  $ nexus vibe rollback 11111111-2222-4333-8444-555555555555 --watch
  $ nexus vibe rollback 11111111-2222-4333-8444-555555555555 --to 1a2b3c4
`
    )
    .action(
      async (
        appId: string,
        cmdOpts: { to?: string; confirmOverage?: boolean; watch?: boolean }
      ) => {
        try {
          const opts = resolveTenantOpts(program);

          // --to is a redeploy, not a restore: same endpoint as `deploy --sha`,
          // so it inherits the overage question and every other deploy rule
          // rather than reimplementing them here.
          if (cmdOpts.to !== undefined) {
            const triggerSha = resolveTriggerSha(cmdOpts.to, "--to");
            // The SAME flow `deploy --sha` runs, not a copy of it — including
            // the y/N spend prompt and the re-run hint, which a partial copy
            // here silently dropped. The hint names `rollback --to`, because
            // telling someone to re-run `deploy` is a wrong instruction.
            const data = await triggerDeploymentAnsweringOverage(
              opts,
              appId,
              triggerSha,
              `nexus vibe rollback ${appId} --to ${cmdOpts.to} --confirm-overage`,
              cmdOpts.confirmOverage === true
            );
            if (data === null) {
              process.exitCode = 1;
              return;
            }
            // Same single-document rule as `deploy --watch`; see there.
            const watchingRedeploy = cmdOpts.watch === true;
            if (!watchingRedeploy || !isJsonMode()) printTriggeredDeployment(data, appId);
            if (watchingRedeploy) {
              process.exitCode = await runDeploymentWatch(program, appId, data.deployment.id);
            }
            return;
          }

          const data = await tenantRequest<RollbackAppResponse>(opts, {
            method: "POST",
            path: `/api/vibe/apps/${encodeURIComponent(appId)}/rollback`
          });

          const watching = cmdOpts.watch === true;
          if (!watching || !isJsonMode()) printRollback(data);

          if (watching) {
            process.exitCode = await runDeploymentWatch(program, appId, data.restoredDeployment.id);
          }
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
}

function printRollback(data: RollbackAppResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const restored = data.restoredDeployment;
  console.log(color.green("✓") + " Rollback started");
  console.log(
    `  v${String(data.supersededDeployment.versionNumber)} → v${String(restored.versionNumber)} (${restored.triggerSha.slice(0, 7)})`
  );
  // Said explicitly because the word "rollback" reads as destructive: the
  // outgoing version keeps serving until the restored one is healthy.
  console.log(
    color.dim("  The version serving now keeps every request until the restored one is healthy.")
  );
}

// ============================================================
// vibe app
// ============================================================

function registerAppCommands(vibe: Command, program: Command): void {
  const app = vibe.command("app").description("Manage Vibe apps");

  app
    .command("list")
    .description("List the org's Vibe apps, newest-first")
    .action(async () => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListVibeAppsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/apps"
        });
        printVibeAppList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  app
    .command("get <appId>")
    .description("Show one Vibe app by id")
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<SingleVibeAppResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}`
        });
        printVibeApp(data.app);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  app
    .command("update <appId>")
    .description("Update a Vibe app (partial — only the flags you pass change)")
    .option(
      "--deploy-branch <branch>",
      "Branch whose pushes deploy (plain name, e.g. main or release/prod)."
    )
    .option("--description <text>", "Set the app description.")
    .option("--require-approvals <bool>", "Gate prod deploys behind approval. One of: true, false.")
    .option(
      "--resource-quotas <json>",
      'Full Nomad quotas object, e.g. \'{"cpuMhz":1000,"memoryMiB":1024,"maxInstances":5}\'. Replaces the whole object.'
    )
    .option(
      "--health-check <json>",
      "Full health-check policy object (path/port/timeouts/thresholds). Replaces the whole object."
    )
    .addHelpText(
      "after",
      `
Every field is optional; only the flags you pass are changed (the rest are
left untouched). At least one flag is required. --resource-quotas and
--health-check each replace the entire object atomically — the server
fully validates the new shape, so pass every field.

Examples:
  $ nexus vibe app update 11111111-2222-4333-8444-555555555555 --deploy-branch release/prod
  $ nexus vibe app update 11111111-2222-4333-8444-555555555555 --require-approvals true
  $ nexus vibe app update 11111111-2222-4333-8444-555555555555 --resource-quotas '{"cpuMhz":1000,"memoryMiB":1024,"maxInstances":5}'
`
    )
    .action(
      async (
        appId: string,
        cmdOpts: {
          deployBranch?: string;
          description?: string;
          requireApprovals?: string;
          resourceQuotas?: string;
          healthCheck?: string;
        }
      ) => {
        try {
          const body = buildAppUpdateBody(cmdOpts);
          const opts = resolveTenantOpts(program);
          const data = await tenantRequest<SingleVibeAppResponse>(opts, {
            method: "PATCH",
            path: `/api/vibe/apps/${encodeURIComponent(appId)}`,
            body
          });
          printVibeApp(data.app);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  app
    .command("create <name>")
    .description("Create a new Vibe app")
    .option("--description <text>", "Optional app description.")
    .option(
      "--public",
      "Make the app browser-reachable (no per-app edge-auth token). Default is private — reachable only via agent tool calls."
    )
    .addHelpText(
      "after",
      `
The name is the app's org-unique handle and must be a DNS label: start
with a lowercase letter, then lowercase letters / digits / hyphens, ≤ 63
chars (it backs the app's subdomain). The canonical public URL and the
default deploy branch (main) are stamped server-side at creation.

Visibility (default PRIVATE): a private app carries a per-app edge-auth
token, so its URL is reachable only by callers that send the token — the
platform injects it on agent tool calls, so private apps are agent-tool-only.
--public skips the token, so anyone with the URL reaches the app (a
browser-viewable site / dashboard / docs / public webhook — no app auth).

Examples:
  $ nexus vibe app create stripe-handler
  $ nexus vibe app create orders-api --description "Order webhook handler"
  $ nexus vibe app create landing --public
`
    )
    .action(async (name: string, cmdOpts: { description?: string; public?: boolean }) => {
      try {
        const appName = resolveAppName(name);
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<SingleVibeAppResponse>(opts, {
          method: "POST",
          path: "/api/vibe/apps",
          body: {
            name: appName,
            description: cmdOpts.description,
            visibility: cmdOpts.public ? "PUBLIC" : "PRIVATE"
          }
        });
        printVibeApp(data.app);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  app
    .command("visibility <appId> <mode>")
    .description("Set who may reach a deployed app: public (anyone) or private (identity required)")
    .addHelpText(
      "after",
      `
private requires an identity on every request: an agent tool call carries
the app's edge token automatically, and a person is sent to sign in with
Nexus and admitted if the app's access list allows them. An API client with
neither gets a 401 — never a silent 404.

public requires nothing at all. Anyone with the URL opens the app, and the
app's access list stops gating anything until it is private again.

Going private mints a FRESH edge token, so an app already registered as a
tool must be re-registered to pick it up.

Examples:
  $ nexus vibe app visibility 11111111-2222-4333-8444-555555555555 public
  $ nexus vibe app visibility 11111111-2222-4333-8444-555555555555 private
`
    )
    .action(async (appId: string, mode: string) => {
      try {
        // Validated here rather than sent on: a typo would otherwise reach the
        // server as a 400 whose message is about a Zod enum, when the real
        // answer is the two words this command accepts.
        const normalized = mode.trim().toLowerCase();
        if (normalized !== "public" && normalized !== "private") {
          throw new Error(`Visibility must be "public" or "private", got "${mode}".`);
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<SetVisibilityResponse>(opts, {
          method: "PATCH",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/visibility`,
          body: { visibility: normalized === "public" ? "PUBLIC" : "PRIVATE" }
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(
          normalized === "public"
            ? color.green("App is now public — anyone with the URL can open it.")
            : color.green("App is now private — a sign-in or the app token is required.")
        );
        // The re-register warning is the one thing a user cannot recover from by
        // guessing: the old token silently stops working on a tool that looks
        // configured.
        if (data.toolResyncRequired) {
          console.log(
            color.yellow(
              "This app is registered as a tool. Re-register it — a fresh edge token was minted and the old one no longer works."
            )
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  app
    .command("delete <appId>")
    .description("Delete a Vibe app and stop serving it")
    .option("--yes", "Skip the confirmation prompt (required when not on a terminal).")
    .addHelpText(
      "after",
      `
The app is soft-deleted: it drops out of "app list" and out of the console at
once, and its access grants are removed so they cannot outlive it. The name is
released, so you can create a new app with the same name afterwards.

The app's git project is NOT deleted — a project can back several apps, so it
outlives any one of them. Remove it separately with "git-project delete" if
nothing else needs it.

Examples:
  $ nexus vibe app delete 11111111-2222-4333-8444-555555555555
  $ nexus vibe app delete 11111111-2222-4333-8444-555555555555 --yes
`
    )
    .action(async (appId: string, cmdOpts: { yes?: boolean }) => {
      try {
        const ok = await confirmDestructive(
          `Delete app ${appId}? It will stop being served.`,
          `nexus vibe app delete ${appId} --yes`,
          cmdOpts.yes
        );
        if (!ok) {
          process.exitCode = 1;
          return;
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<DeletedIdResponse>(opts, {
          method: "DELETE",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}`
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(`${color.green("✓")} Deleted app ${data.deletedId}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  app
    .command("edge-token <appId>")
    .description("Reveal the token a caller needs to reach this app while it is private")
    .addHelpText(
      "after",
      `
A private app admits a request only when it carries this token in the
X-Vibe-App-Token header. The platform injects it automatically on agent tool
calls; this command is how everything else gets it — a partner system, a CI job,
a developer with curl or Postman.

That is the middle ground between the two extremes: the app stays private, and a
caller you hand the token to can still reach it. Going --public to unblock a
caller removes app-level auth for everyone, and is not the same trade.

A PUBLIC app has no token and this command returns 409 — it needs none, since
anyone with the URL already reaches it.

The token is printed in full. Treat the output as a secret: pipe it, don't paste
it into a shared terminal.

Examples:
  $ nexus vibe app edge-token 11111111-2222-4333-8444-555555555555
  $ nexus --json vibe app edge-token 11111111-2222-4333-8444-555555555555
`
    )
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetEdgeTokenResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/edge-token`
        });
        printEdgeToken(data.edgeToken);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  app
    .command("rotate-edge-token <appId>")
    .description("Mint a fresh edge token for a private app and retire the old one")
    .option("--yes", "Skip the confirmation prompt (required when not on a terminal).")
    .addHelpText(
      "after",
      `
Rotation is immediate and there is no grace period: the moment it returns, every
caller still sending the previous token is refused at the edge. Rotate when a
token has leaked, or on whatever schedule you keep — but hand the new one out
first if callers depend on it.

If the app is registered as an agent tool, the tool holds a copy of the old
token and must be re-registered. The command says so when that applies.

Examples:
  $ nexus vibe app rotate-edge-token 11111111-2222-4333-8444-555555555555
  $ nexus vibe app rotate-edge-token 11111111-2222-4333-8444-555555555555 --yes
`
    )
    .action(async (appId: string, cmdOpts: { yes?: boolean }) => {
      try {
        const ok = await confirmDestructive(
          `Rotate the edge token for ${appId}? Callers using the current token stop working immediately.`,
          `nexus vibe app rotate-edge-token ${appId} --yes`,
          cmdOpts.yes
        );
        if (!ok) {
          process.exitCode = 1;
          return;
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<RotateEdgeTokenResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/edge-token/rotate`
        });

        printEdgeToken(data.edgeToken, data.toolResyncRequired);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  app
    .command("register-as-tool <appId>")
    .description("Register a deployed Vibe app as a CUSTOM_MANIFEST agent tool")
    .option("--spec-file <path>", "Path to the app's OpenAPI spec file (JSON or YAML).")
    .option(
      "--spec <string>",
      "The app's OpenAPI spec inline, as a string. Alternative to --spec-file."
    )
    .option("--name <name>", "Override the registered tool's name. Default: the app's name.")
    .option("--description <text>", "Override the registered tool's description.")
    .addHelpText(
      "after",
      `
The platform owns the tool's endpoint URL — it is the app's canonical
public URL (\`VibeApp.publicUrl\`), set server-side. You cannot point the
tool at an arbitrary host. Supply exactly one of --spec-file / --spec.

The app must have a healthy deployment and must not already be registered
(idempotent: a second call returns 409 with the existing tool id). Auth
defaults to none at v1 — a deployed Vibe app is reachable without extra
credentials; tighten per-app as Vault-backed secrets land.

Examples:
  $ nexus vibe app register-as-tool 11111111-2222-4333-8444-555555555555 --spec-file ./openapi.json
  $ nexus vibe app register-as-tool 11111111-2222-4333-8444-555555555555 --spec-file ./api.yaml --name "Orders API"
  $ nexus vibe app register-as-tool 11111111-2222-4333-8444-555555555555 --spec-file ./openapi.json --json | jq .id
`
    )
    .action(
      async (
        appId: string,
        cmdOpts: { specFile?: string; spec?: string; name?: string; description?: string }
      ) => {
        try {
          const openApiSpec = resolveOpenApiSpec(cmdOpts);
          const opts = resolveTenantOpts(program);
          const tool = await tenantRequest<ExternalToolDetail>(opts, {
            method: "POST",
            path: `/api/public/v1/vibe/apps/${encodeURIComponent(appId)}/register-as-tool`,
            body: {
              openApiSpec,
              name: cmdOpts.name,
              description: cmdOpts.description
            }
          });
          printRegisteredTool(tool);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  app
    .command("provision-repo <appId>")
    .description("Provision a git project for a Vibe app")
    .option(
      "--git-url <url>",
      "Git remote the build executor clones at deploy time (e.g. file:///path/to/repo or https://…)."
    )
    .addHelpText(
      "after",
      `
Creates a git project (the standalone code store) in PENDING and attaches
the app to it; the project takes the app's name and deploy branch. The
build executor clones --git-url at the pushed sha. The git URL is optional
here and can be set at provision time only — a deploy needs it, so pass it
unless you are wiring the project up by other means.

Provisioning an app that already has a git project returns 409. If a
project's provisioning FAILED, use "reprovision-repo" to retry it.

Examples:
  $ nexus vibe app provision-repo 11111111-2222-4333-8444-555555555555 --git-url file:///tmp/my-repo
  $ nexus vibe app provision-repo 11111111-2222-4333-8444-555555555555 --git-url https://github.com/acme/svc.git
`
    )
    .action(async (appId: string, cmdOpts: { gitUrl?: string }) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<SingleVibeGitProjectResponse>(opts, {
          method: "POST",
          // Legacy path segment on purpose — prod backends may predate the
          // rename for days after this CLI publishes; the canonical
          // `git-project` segment takes over next release.
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/repository`,
          body: { gitRemoteUrl: cmdOpts.gitUrl }
        });
        printVibeGitProject(data.gitProject ?? data.repository);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  app
    .command("attach-repo <appId> <gitProjectId>")
    .description("Attach an EXISTING git project to a Vibe app")
    .addHelpText(
      "after",
      `
The counterpart to "provision-repo", which MINTS a new project named after
the app. Once a project already holds your code, that is the wrong verb —
this one points the app at the project you already have.

Why it matters: a push only deploys to apps ATTACHED to the project it went
to. An app that was never attached is invisible to that fan-out, so every
push advances the project's refs and deploys nothing — and, because a
project with no apps is a legitimate code store, nothing reports it as
wrong. If your app says "Never deployed" while your pushes succeed, this is
almost certainly why. Check with "nexus vibe app get <appId>".

Attaching to the project the app already has is a no-op success, so this is
safe to re-run. Attaching to a DIFFERENT project returns 409 — an app is not
re-pointed at another code store by accident.

Examples:
  $ nexus vibe app attach-repo 11111111-2222-4333-8444-555555555555 99999999-8888-4777-8666-555555555555
  $ nexus vibe git-project list      # find the project id
`
    )
    .action(async (appId: string, gitProjectId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<SingleVibeGitProjectResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/git-project/attach`,
          body: { gitProjectId }
        });
        printVibeGitProject(data.gitProject ?? data.repository);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  app
    .command("reprovision-repo <appId>")
    .description("Retry provisioning a FAILED git project")
    .addHelpText(
      "after",
      `
A git project whose in-cluster materialization FAILED is otherwise a dead
end — the provision path 409s on the already-attached guard. This re-arms
the FAILED project back to PENDING so the agent re-materializes it on its
next pull; nothing else changes (same project id, same git URL).

Only a FAILED project can be retried — READY / PENDING / ARCHIVED return
409, and an app with no git project returns 404.

Examples:
  $ nexus vibe app reprovision-repo 11111111-2222-4333-8444-555555555555
`
    )
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<SingleVibeGitProjectResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/repository/reprovision`
        });
        printVibeGitProject(data.gitProject ?? data.repository);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

// ============================================================
// vibe git-project
// ============================================================

function registerGitProjectCommands(vibe: Command, program: Command): void {
  const project = vibe
    .command("git-project")
    .description("Manage git projects — the standalone code store apps deploy from")
    .addHelpText(
      "after",
      `
A git project is the git primitive: an org-scoped code store materialized as
a repository on your tenant's git host. It stands on its own — a project with
no app attached is a pure code store. Push to it and its refs advance; nothing
deploys, because deployment is an app's job.

Apps point at a project ("many apps → one project"), so one code store can
back several apps watching different branches. "nexus vibe app provision-repo"
is the app-centric shortcut that creates a project and attaches it in one step.

Examples:
  $ nexus vibe git-project create my-lib
  $ nexus vibe git-project list
  $ nexus vibe git-project get 11111111-2222-4333-8444-555555555555
  $ nexus vibe git-project delete 11111111-2222-4333-8444-555555555555
`
    );

  project
    .command("create <name>")
    .description("Create a standalone git project (no app attached)")
    .option("--description <text>", "Human-readable description of the project.")
    .option("--default-branch <branch>", 'Branch the repo is created with (default: "main").')
    .option(
      "--git-url <url>",
      "Git remote the build executor clones (e.g. file:///path/to/repo or https://…). Normally omitted — your tenant reports its own remote once the repo materializes."
    )
    .addHelpText(
      "after",
      `
The name is org-unique and becomes the repository name on the git host, so it
must be a lowercase slug: start with a letter, then letters / digits / hyphens,
≤ 63 characters. It is stamped at creation and stable for the project's life.

The project lands in PENDING and your tenant materializes the repository
shortly after; "get" shows it flip to READY. (A project only materializes once
your tenant's git host is healthy — until then it simply stays PENDING.)

The name is taken within your org while the project lives, so creating a second
project by that name returns 409 — as does an app trying to provision its own
repo under it. Release the name with "git-project delete" when you no longer
need the project.

Examples:
  $ nexus vibe git-project create shared-lib
  $ nexus vibe git-project create shared-lib --description "Shared helpers" --default-branch trunk
`
    )
    .action(
      async (
        name: string,
        cmdOpts: { description?: string; defaultBranch?: string; gitUrl?: string }
      ) => {
        try {
          const opts = resolveTenantOpts(program);
          const data = await tenantRequest<StandaloneVibeGitProjectResponse>(opts, {
            method: "POST",
            path: "/api/vibe/git-projects",
            body: {
              name,
              description: cmdOpts.description,
              defaultBranch: cmdOpts.defaultBranch,
              gitRemoteUrl: cmdOpts.gitUrl
            }
          });
          printVibeGitProject(data.gitProject);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  project
    .command("list")
    .description("List your organization's git projects, newest first")
    .addHelpText(
      "after",
      `
Lists every project in your org — standalone code stores and the ones apps
are attached to alike, in every lifecycle status.

Examples:
  $ nexus vibe git-project list
  $ nexus vibe --json git-project list
`
    )
    .action(async () => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListVibeGitProjectsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/git-projects"
        });
        printVibeGitProjectList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  project
    .command("get <projectId>")
    .description("Get a git project by id")
    .addHelpText(
      "after",
      `
Shows the project's lifecycle status and its build source. A PENDING project
has not been materialized on the git host yet; READY is serving. FAILED means
materialization failed — retry it with "git-project reprovision".

Build source is what the build executor clones — it is not your push remote.
Run "nexus vibe git-credentials" for the URL and token you push with.

Examples:
  $ nexus vibe git-project get 11111111-2222-4333-8444-555555555555
`
    )
    .action(async (projectId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<StandaloneVibeGitProjectResponse>(opts, {
          method: "GET",
          path: `/api/vibe/git-projects/${encodeURIComponent(projectId)}`
        });
        printVibeGitProject(data.gitProject);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  project
    .command("reprovision <projectId>")
    .description("Retry provisioning a FAILED git project")
    .addHelpText(
      "after",
      `
A project whose materialization FAILED is otherwise a dead end — its name is
taken, so you cannot simply create it again. This re-arms it back to PENDING
and your tenant re-materializes it on its next pass; nothing else changes
(same project id, same URL).

Only a FAILED project can be retried — READY / PENDING / ARCHIVED return 409.

Examples:
  $ nexus vibe git-project reprovision 11111111-2222-4333-8444-555555555555
`
    )
    .action(async (projectId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<StandaloneVibeGitProjectResponse>(opts, {
          method: "POST",
          path: `/api/vibe/git-projects/${encodeURIComponent(projectId)}/reprovision`
        });
        printVibeGitProject(data.gitProject);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  project
    .command("delete <projectId>")
    .description("Delete a git project and release its name")
    .option("--yes", "Skip the confirmation prompt (required when not on a terminal).")
    .addHelpText(
      "after",
      `
The project is soft-deleted and its name is released, so a later project — or an
app provisioning its own repo — can take that name again.

Any app still pointing at this project reads as having no project at all, which
means it stops deploying on push. Check with "app get <appId>" before deleting a
project you did not create standalone.

Examples:
  $ nexus vibe git-project delete 11111111-2222-4333-8444-555555555555
  $ nexus vibe git-project delete 11111111-2222-4333-8444-555555555555 --yes
`
    )
    .action(async (projectId: string, cmdOpts: { yes?: boolean }) => {
      try {
        const ok = await confirmDestructive(
          `Delete git project ${projectId}? Apps pointing at it stop deploying.`,
          `nexus vibe git-project delete ${projectId} --yes`,
          cmdOpts.yes
        );
        if (!ok) {
          process.exitCode = 1;
          return;
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<DeletedIdResponse>(opts, {
          method: "DELETE",
          path: `/api/vibe/git-projects/${encodeURIComponent(projectId)}`
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(`${color.green("✓")} Deleted git project ${data.deletedId} — name released`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

// ============================================================
// vibe audit
// ============================================================

function registerAuditCommands(vibe: Command, program: Command): void {
  const audit = vibe.command("audit").description("Read the per-org Vibe audit feed");

  audit
    .command("list")
    .description("List recent Vibe audit events, newest-first (cursor paginated)")
    .option(
      "--app <appId>",
      "Filter to a single VibeApp. Mismatched (app, org) returns an empty page — cross-tenant reads never leak existence."
    )
    .option(
      "--type <eventType>",
      `Filter to a single event type. One of: ${AUDIT_EVENT_TYPES.join(", ")}.`
    )
    .option("--limit <n>", "Page size, 1-100. Default 50.", "50")
    .option("--cursor <opaque>", "Cursor from a prior page's `nextCursor`. First-page calls omit.")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus vibe audit list
  $ nexus vibe audit list --limit 20
  $ nexus vibe audit list --type DEPLOYMENT_TRIGGERED --app 11111111-2222-4333-8444-555555555555
  $ nexus vibe audit list --cursor "2026-05-25T12:00:00.000Z|abc…"
  $ nexus vibe audit list --json | jq '.events[]'

Output:
  Human mode prints a table with the most-load-bearing field per
  event type collapsed into the "details" column — sha+gated for
  triggers, decider+decisive for approvals, usageType+sum+cap+period
  for cost-safety suspensions, priorStatus+reason for rollbacks.

  --json mode passes the wire envelope through unchanged so jq
  consumers see the discriminated-union payload + nextCursor field
  as-is.

Pagination:
  When more pages exist, the bottom of the table surfaces the
  nextCursor verbatim — paste it back as --cursor for the next page.
  When nextCursor is null, you've reached the end of the visible
  window. Audit rows are append-only: re-running with no cursor
  always returns the newest first.
`
    )
    .action(async (cmdOpts: { app?: string; type?: string; limit?: string; cursor?: string }) => {
      try {
        const limit = parseLimit(cmdOpts.limit);
        if (cmdOpts.type !== undefined && !isAuditEventType(cmdOpts.type)) {
          throw new Error(
            `Invalid --type "${cmdOpts.type}". Allowed: ${AUDIT_EVENT_TYPES.join(", ")}.`
          );
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListAuditEventsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/audit-events",
          query: {
            vibeAppId: cmdOpts.app,
            eventType: cmdOpts.type,
            cursor: cmdOpts.cursor,
            limit
          }
        });
        printAuditEvents(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}

// ============================================================
// Helpers
// ============================================================

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return 50;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(`Invalid --limit "${raw}". Expected an integer in [1, 100].`);
  }
  return parsed;
}

/**
 * Resolve the OpenAPI spec string from exactly one of --spec-file / --spec.
 * The endpoint requires a non-empty spec; supplying neither or both is a
 * client-side usage error caught before the request goes out.
 */
function resolveOpenApiSpec(cmdOpts: { specFile?: string; spec?: string }): string {
  const { specFile, spec } = cmdOpts;
  if (specFile !== undefined && spec !== undefined) {
    throw new Error("Pass exactly one of --spec-file or --spec, not both.");
  }
  if (specFile !== undefined) {
    let contents: string;
    try {
      contents = readFileSync(specFile, "utf8");
    } catch (err) {
      throw new Error(
        `Could not read OpenAPI spec file "${specFile}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
    if (contents.trim().length === 0) {
      throw new Error(`OpenAPI spec file "${specFile}" is empty.`);
    }
    return contents;
  }
  if (spec !== undefined) {
    if (spec.trim().length === 0) throw new Error("--spec must not be empty.");
    return spec;
  }
  throw new Error("Missing OpenAPI spec. Pass --spec-file <path> or --spec <string>.");
}

function resolveTenantOpts(program: Command): TenantHttpOptions {
  const globals = program.optsWithGlobals();
  return {
    apiKey: globals.apiKey as string | undefined,
    baseUrl: globals.baseUrl as string | undefined,
    profile: globals.profile as string | undefined
  };
}

function printAuditEvents(data: ListAuditEventsResponse): void {
  if (isJsonMode()) {
    // Pass the wire envelope through unchanged so jq consumers see the
    // discriminated union as the backend emitted it.
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (data.events.length === 0) {
    console.log(color.dim("No audit events match this query."));
    return;
  }

  const rows = data.events.map((e) => ({
    // The event id is shortened: `vibe audit` only lists, so no command
    // takes it. The APP id is not — it is the argument to `app get`,
    // `deployments list` and `deploy`, and this feed is often where a
    // reader first sees it.
    id: shortenId(e.id),
    createdAt: formatTimestamp(e.createdAt),
    eventType: colorizeEventType(e.payload.eventType),
    vibeAppId: e.vibeAppId === null ? color.dim("—") : e.vibeAppId,
    actor: e.actorUserId === null ? color.dim("system") : shortenId(e.actorUserId),
    details: formatPayloadDetails(e.payload)
  }));

  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "id", label: "Id", width: 10 },
    { key: "createdAt", label: "Created" },
    { key: "eventType", label: "Event" },
    { key: "vibeAppId", label: "App" },
    { key: "actor", label: "Actor", width: 10 },
    { key: "details", label: "Details" }
  ]);

  printPaginationMeta({ hasMore: data.nextCursor !== null });
  if (data.nextCursor !== null) {
    console.log(color.dim(`\nNext page:\n  nexus vibe audit list --cursor "${data.nextCursor}"`));
  }
}

function printRegisteredTool(tool: ExternalToolDetail): void {
  if (isJsonMode()) {
    // Pass the tool detail through unchanged so jq consumers see the
    // create-external-tool shape as the backend emitted it.
    console.log(JSON.stringify(tool, null, 2));
    return;
  }

  console.log(color.green("✓") + " Registered Vibe app as agent tool");
  printRecord(tool as unknown as Record<string, unknown>, [
    { key: "id", label: "Tool ID" },
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "endpointUrl", label: "Endpoint" },
    { key: "status", label: "Status" },
    { key: "actionsCount", label: "Actions" },
    { key: "authType", label: "Auth" },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) }
  ]);
}

/**
 * Build the PATCH body from the update flags. Only flags the caller passed
 * become body keys (undefined = leave alone, matching the backend's
 * partial-update contract). Refuses an empty change set client-side so the
 * user gets a clear message instead of the backend's 400.
 */
function buildAppUpdateBody(cmdOpts: {
  deployBranch?: string;
  description?: string;
  requireApprovals?: string;
  resourceQuotas?: string;
  healthCheck?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (cmdOpts.deployBranch !== undefined) body.deployBranch = cmdOpts.deployBranch;
  if (cmdOpts.description !== undefined) body.description = cmdOpts.description;
  if (cmdOpts.requireApprovals !== undefined) {
    body.requireApprovals = parseBoolFlag(cmdOpts.requireApprovals, "--require-approvals");
  }
  if (cmdOpts.resourceQuotas !== undefined) {
    body.resourceQuotas = parseJsonFlag(cmdOpts.resourceQuotas, "--resource-quotas");
  }
  if (cmdOpts.healthCheck !== undefined) {
    body.healthCheckConfig = parseJsonFlag(cmdOpts.healthCheck, "--health-check");
  }
  if (Object.keys(body).length === 0) {
    throw new Error(
      "Nothing to update. Pass at least one of --deploy-branch, --description, --require-approvals, --resource-quotas, --health-check."
    );
  }
  return body;
}

function parseBoolFlag(raw: string, flag: string): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Invalid ${flag} "${raw}". Expected "true" or "false".`);
}

function parseJsonFlag(raw: string, flag: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid ${flag}: not valid JSON.`);
  }
}

/**
 * Validate the app name client-side for a clear message before the request.
 * Mirrors VibeAppNameSchema (DNS-label: lowercase letter start, then
 * lowercase alnum + hyphen, ≤ 63). The server re-validates.
 */
function resolveAppName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0 || name.length > 63 || !/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `Invalid app name "${raw}". Must start with a lowercase letter and contain only lowercase letters, digits, and hyphens (≤ 63 chars).`
    );
  }
  return name;
}

/** Validate the trigger sha client-side for a clear message before the request. */
function resolveTriggerSha(raw: string, flag = "--sha"): string {
  const sha = raw.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    // Named by the caller, because two verbs take a sha under two different
    // flags. Telling someone who typed `--to` that their `--sha` is invalid
    // sends them looking for a flag they never used.
    throw new Error(`Invalid ${flag} "${raw}". Expected 7–40 hexadecimal characters.`);
  }
  return sha;
}

/**
 * Split a `NAME=VALUE` assignment. The value is everything after the
 * first `=`, so values may contain `=` and may be empty. NAME is
 * validated against the backend's SCREAMING_SNAKE_CASE rule locally for
 * an early, network-free error.
 */
function parseEnvAssignment(raw: string): { name: string; value: string } {
  const eq = raw.indexOf("=");
  if (eq === -1) {
    throw new Error(`Invalid assignment "${raw}". Expected NAME=VALUE.`);
  }
  const name = raw.slice(0, eq).trim();
  const value = raw.slice(eq + 1);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid env var name "${name}". Must be SCREAMING_SNAKE_CASE (A-Z, 0-9, underscore; not starting with a digit).`
    );
  }
  return { name, value };
}

function resolveEnvScope(raw: string | undefined): VibeEnvVarScope | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toUpperCase();
  if (!isVibeEnvVarScope(v)) {
    throw new Error(
      `Invalid --scope "${raw}". Expected one of: ${VIBE_ENV_VAR_SCOPES.join(", ")}.`
    );
  }
  return v;
}

/**
 * Handle the soft-limit question. Returns true only when the caller
 * explicitly said yes and the deploy should be re-sent confirmed.
 *
 * Interactive: print the situation and ask y/N (same readline idiom as the
 * destructive-delete confirmations elsewhere in the CLI).
 *
 * Non-interactive (piped, CI, `--json`): NEVER auto-confirm and never exit
 * clean. Print the exact re-run with `--confirm-overage` and return false so
 * the command exits non-zero — a scripted deploy that silently stops while
 * reporting success is the worst possible outcome for a spend gate.
 */
async function confirmOverageInteractively(
  data: Extract<TriggerDeploymentResponse, { status: "confirmation_required" }>,
  rerun: string
): Promise<boolean> {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    console.error(`Spend confirmation required. Re-run confirmed:\n  ${rerun}`);
    return false;
  }

  console.log(color.yellow("Spend confirmation required — nothing was deployed."));
  console.log(`  Cost-safety status: ${data.reason.costSafetyStatus}`);
  console.log(`  ${data.reason.message}`);

  if (!process.stdout.isTTY) {
    console.error(`\nRe-run confirmed:\n  ${rerun}`);
    return false;
  }

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Deploy anyway and accept the additional spend? [y/N] ");
  rl.close();
  if (answer.toLowerCase() !== "y") {
    console.log("Aborted.");
    console.log(color.dim(`Re-run confirmed:\n  ${rerun}`));
    return false;
  }
  return true;
}

/**
 * Trigger a deployment and carry the org's spend question through to an answer.
 *
 * Returns the CREATED deployment, or `null` when nothing was created — the
 * caller exits non-zero on `null` and has nothing to watch. A scripted deploy
 * that stops while reporting success is worse than any refusal, so "the user
 * declined", "there was no TTY to ask" and "the org's state moved mid-flight"
 * all collapse to the same `null`.
 *
 * This exists as ONE function because there are two verbs that trigger a
 * deployment — `deploy --sha` and `rollback --to` — and the second was written
 * as a partial copy of the first that dropped the y/N prompt and the
 * `--confirm-overage` re-run hint entirely. A TTY user rolling back never got
 * asked, and a script never got told how to answer, while the help text
 * promised the path was exactly like `deploy --sha`. A second copy of a flow
 * is a second place for it to be incomplete.
 *
 * `rerun` is passed in rather than composed here for the same reason: the hint
 * has to name the command the operator actually ran, and a hardcoded
 * `nexus vibe deploy …` printed at someone running `rollback` is a wrong
 * instruction, not a missing one.
 */
async function triggerDeploymentAnsweringOverage(
  opts: TenantHttpOptions,
  appId: string,
  triggerSha: string,
  rerun: string,
  confirmedUpfront: boolean,
  forceRebuild = false
): Promise<Extract<TriggerDeploymentResponse, { status: "created" | "reused" }> | null> {
  const send = async (confirmOverage: boolean): Promise<TriggerDeploymentResponse> =>
    tenantRequest<TriggerDeploymentResponse>(opts, {
      method: "POST",
      path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments`,
      // `forceRebuild` rides every send, including the post-confirmation one:
      // the re-send is the SAME request answered, so dropping it there would
      // silently deploy the reused image the operator asked to replace.
      body: { triggerSha, confirmOverage, forceRebuild }
    });

  let data = await send(confirmedUpfront);

  if (data.status === "confirmation_required") {
    const answered = await confirmOverageInteractively(data, rerun);
    if (!answered) return null;
    data = await send(true);
    // A confirmed re-send that still asks means the org's state moved
    // mid-flight. Nothing was created, so this must not exit clean.
    if (data.status === "confirmation_required") {
      printTriggeredDeployment(data, appId);
      return null;
    }
  }

  return data;
}

/**
 * Gate a destructive command. Returns true only when the caller has actually
 * agreed — either by passing `--yes` up front, or by answering y at the prompt.
 *
 * Non-interactive without `--yes` REFUSES: it prints the exact re-run and
 * returns false, and the caller exits non-zero. The alternative idiom found
 * elsewhere in this CLI — `if (!opts.yes && process.stdout.isTTY)` — inverts
 * this, so a piped or CI invocation skips the prompt and deletes unprompted.
 * That is the wrong direction for a gate: the environment least able to
 * reconsider is the one it waves through. Same stance as
 * `confirmOverageInteractively` above, for the same reason.
 *
 * Bare Enter is a NO. The prompt is spelled `[y/N]`, so the capital is a promise
 * about which way the default falls, and only the literal `y` may pass.
 */
async function confirmDestructive(
  question: string,
  rerun: string,
  yes: boolean | undefined
): Promise<boolean> {
  if (yes === true) return true;

  if (isJsonMode() || !process.stdout.isTTY) {
    console.error(`Refusing to proceed without confirmation. Re-run:\n  ${rerun}`);
    return false;
  }

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();

  if (answer.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    return false;
  }
  return true;
}

function printTriggeredDeployment(data: TriggerDeploymentResponse, appId: string): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Defensive: the caller only reaches here after answering the question, so
  // a second confirmation_required means the org's state changed mid-flight.
  if (data.status === "confirmation_required") {
    console.log(color.yellow("Spend confirmation required — nothing was deployed."));
    console.log(`  ${data.reason.message}`);
    return;
  }

  const d = data.deployment;
  if (data.status === "reused") {
    // Say what did NOT happen, and why that is the right outcome. Without
    // this the operator sees a version number they did not expect and
    // re-runs, which is the exact loop that produced the duplicate.
    console.log(color.green("✓") + " Already deploying this commit — reusing it");
    console.log(
      color.dim(
        "  Nothing new was started: an app rolls out one deployment at a time, so a second\n" +
          "  one for the same commit leaves the first unplaced and it fails on the health\n" +
          "  timeout. Use --force-rebuild to build this commit again."
      )
    );
  } else {
    console.log(color.green("✓") + " Deployment triggered");
  }
  // No Builder row here on purpose: the build has not run yet, and which
  // strategy it will use is decided inside the executor over a checkout that
  // has not been cloned. It shows up on `vibe deployment get` once the build
  // reports. This line used to print the requested builder, which the executor
  // never read.
  printRecord(d as unknown as Record<string, unknown>, [
    { key: "id", label: "Deployment" },
    { key: "versionNumber", label: "Version", format: (v) => `v${String(v)}` },
    { key: "status", label: "Status" },
    { key: "triggerSha", label: "Commit", format: (v) => String(v).slice(0, 7) },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) }
  ]);

  if (data.approvalRequest !== null) {
    const r = data.approvalRequest;
    console.log(
      color.yellow(
        `\nApproval gate: ${r.status} — ${r.requiredApprovals} approval(s) required before it deploys.`
      )
    );
    console.log(color.dim("Review pending gates: nexus vibe approvals pending"));
  }

  // Path B — surface tool registration at the natural moment. A hint, not a
  // blocking prompt: registration needs the app's OpenAPI spec (no auto-fetch
  // yet) and a HEALTHY deployment, which this trigger does not await.
  // Suppressed by NEXUS_NO_PROMPTS for non-interactive / scripted use.
  if (!process.env.NEXUS_NO_PROMPTS) {
    console.log(
      color.dim(
        `\nOnce healthy, register this app as an agent tool:\n  nexus vibe app register-as-tool ${appId} --spec-file ./openapi.json`
      )
    );
  }
}

/**
 * Colorize a deployment or build-job status: terminal-good green,
 * terminal-bad red, in-flight yellow. Unknown values pass through plain.
 */
function colorizeStatus(status: string): string {
  if (status === "HEALTHY" || status === "SUCCEEDED") return color.green(status);
  if (status === "FAILED" || status === "ROLLED_BACK" || status === "TIMED_OUT") {
    return color.red(status);
  }
  if (
    status === "BUILDING" ||
    status === "DEPLOYING" ||
    status === "RUNNING" ||
    status === "PENDING" ||
    status === "AWAITING_APPROVAL"
  ) {
    return color.yellow(status);
  }
  return status;
}

function printDeploymentList(data: ListDeploymentsResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.deployments.length === 0) {
    console.log(color.dim("No deployments yet."));
    return;
  }

  // Full id: `deployments get <appId> <deploymentId>` takes it.
  const rows = data.deployments.map((d) => ({
    id: d.id,
    version: `v${d.versionNumber}`,
    status: colorizeStatus(d.status),
    commit: d.triggerSha.slice(0, 7),
    createdAt: formatTimestamp(d.createdAt)
  }));

  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "id", label: "Id" },
    { key: "version", label: "Version" },
    { key: "status", label: "Status" },
    { key: "commit", label: "Commit" },
    { key: "createdAt", label: "Created" }
  ]);
}

function printDeploymentDetail(data: GetDeploymentResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const d = data.deployment;
  printRecord(d as unknown as Record<string, unknown>, [
    { key: "id", label: "Deployment" },
    { key: "versionNumber", label: "Version", format: (v) => `v${String(v)}` },
    { key: "status", label: "Status", format: (v) => colorizeStatus(String(v)) },
    { key: "triggerSha", label: "Commit", format: (v) => String(v).slice(0, 7) },
    { key: "imageRef", label: "Image", format: (v) => (v === "" ? "—" : String(v)) },
    // "not detected" rather than "—": a dash reads as "nothing to show", and
    // the reader is usually here BECAUSE the port is wrong. Saying the build
    // observed nothing — and naming the default that therefore applies — is
    // the answer to the question that brought them, in one line.
    {
      key: "detectedPort",
      label: "Detected port",
      format: (v) =>
        v === null || v === undefined
          ? color.dim(`not detected — using ${String(VIBE_DEFAULT_CONTAINER_PORT)}`)
          : String(v)
    },
    { key: "errorReason", label: "Error", format: (v) => (v === null ? "—" : String(v)) },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) }
  ]);

  if (d.forceRebuild) {
    console.log(color.dim("\nBuilt with --force-rebuild — hence the -v suffix on the image tag."));
  }

  if (data.buildJob === null) {
    console.log(color.dim("\nNo build job."));
    return;
  }

  const b = data.buildJob;
  console.log(color.bold("\nBuild job"));
  printRecord(b as unknown as Record<string, unknown>, [
    { key: "id", label: "Id" },
    { key: "status", label: "Status", format: (v) => colorizeStatus(String(v)) },
    { key: "builder", label: "Builder", format: (v) => (v === null ? "—" : String(v)) },
    { key: "durationMs", label: "Duration", format: (v) => (v === null ? "—" : `${String(v)}ms`) },
    { key: "logsRef", label: "Logs", format: (v) => (v === "" ? "—" : String(v)) },
    { key: "errorReason", label: "Error", format: (v) => (v === null ? "—" : String(v)) }
  ]);
}

function printVibeAppList(data: ListVibeAppsResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.apps.length === 0) {
    console.log(color.dim("No Vibe apps yet."));
    return;
  }

  // Full id: this list is where users get the app id, and every other
  // `vibe` command takes it as an argument.
  const rows = data.apps.map((a) => ({
    id: a.id,
    name: a.name,
    deployBranch: a.deployBranch,
    approvals: a.requireApprovals ? color.yellow("required") : color.dim("off"),
    publicUrl: a.publicUrl ?? color.dim("—"),
    createdAt: formatTimestamp(a.createdAt)
  }));

  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "deployBranch", label: "Deploy" },
    { key: "approvals", label: "Approvals" },
    { key: "publicUrl", label: "URL" },
    { key: "createdAt", label: "Created" }
  ]);
}

function printVibeApp(app: VibeAppDto): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(app, null, 2));
    return;
  }

  const q = app.resourceQuotas;
  printRecord(app as unknown as Record<string, unknown>, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "deployBranch", label: "Deploy branch" },
    {
      key: "requireApprovals",
      label: "Approvals",
      format: (v) => (v === true ? "required" : "off")
    },
    { key: "description", label: "Description", format: (v) => (v === null ? "—" : String(v)) },
    { key: "publicUrl", label: "Public URL", format: (v) => (v === null ? "—" : String(v)) },
    {
      // "private (agent-tool only)" was true until a person could sign in to a
      // private app with their Nexus login. Printing it now would tell someone
      // their app is unreachable by humans when it is not.
      key: "visibility",
      label: "Visibility",
      format: (v) =>
        v === "PUBLIC" ? "public (no sign-in required)" : "private (sign-in or app token)"
    },
    {
      key: "edgeReachability",
      label: "Edge",
      // `null` prints as "not checked yet", never as a tick. The probe only asks
      // about a healthy, settled deployment, so most apps are null most of the
      // time — and treating that as health is the silently-green failure the
      // probe exists to end. UNROUTED is the platform's own fault, so it says so.
      format: (v) => {
        if (v === null || v === undefined) return color.dim("not checked yet");
        if (v === "UNROUTED") return color.red("running but unreachable (platform fault)");
        if (v === "ROUTED") return color.green("reachable");
        if (v === "UNAVAILABLE") return "nothing serving it yet";
        if (v === "NO_SUCH_APP") return "not published to the edge yet";
        return color.dim("last check was inconclusive");
      }
    },
    {
      key: "resourceQuotas",
      label: "Quotas",
      format: () => `cpu=${q.cpuMhz}mhz mem=${q.memoryMiB}mib max=${q.maxInstances}`
    },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => formatTimestamp(String(v)) }
  ]);
}

function printEnvVarList(data: ListEnvVarsResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.envVars.length === 0) {
    console.log(color.dim("No env vars set."));
    return;
  }

  const rows = data.envVars.map((e) => ({
    // Full id, not shortenId: `env rm` takes the id and `env list` is the
    // only way to discover it, so the displayed id must be copy-pasteable.
    id: e.id,
    name: e.name,
    // Collapse newlines + truncate so a multiline or huge value never
    // breaks the table. Full value is available via --json.
    value: truncate(e.value.replace(/\s+/g, " "), 48),
    scope: e.scope,
    updatedAt: formatTimestamp(e.updatedAt)
  }));

  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "value", label: "Value" },
    { key: "scope", label: "Scope" },
    { key: "updatedAt", label: "Updated" }
  ]);
}

function printEnvVar(envVar: VibeAppEnvVarDto): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(envVar, null, 2));
    return;
  }

  printRecord(envVar as unknown as Record<string, unknown>, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "value", label: "Value" },
    { key: "scope", label: "Scope" },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => formatTimestamp(String(v)) }
  ]);
}

function printEnvVarDeleted(data: DeleteEnvVarResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`${color.green("✓")} Removed env var ${data.deletedId}`);
}

/**
 * Reveal an edge token, and show the request that uses it.
 *
 * The `curl` line is the point of the command rather than a courtesy: the token
 * is useless without knowing which header carries it, and that header name is
 * exactly what NEX-2972 could not find from outside. Printing the two together
 * means a reader never has to guess the pairing.
 */
function printEdgeToken(edgeToken: VibeEdgeTokenDto, toolResyncRequired?: boolean): void {
  if (isJsonMode()) {
    // Mirror the server's two response shapes exactly: reveal answers
    // `{ edgeToken }`, rotate answers `{ edgeToken, toolResyncRequired }`. The
    // flag is omitted rather than defaulted to false on the reveal path,
    // because reveal changes nothing and so cannot have invalidated a tool —
    // emitting `false` there would answer a question that was never asked.
    console.log(
      JSON.stringify(
        toolResyncRequired === undefined ? { edgeToken } : { edgeToken, toolResyncRequired },
        null,
        2
      )
    );
    return;
  }

  printRecord(edgeToken as unknown as Record<string, unknown>, [
    { key: "token", label: "Token" },
    { key: "headerName", label: "Header" },
    {
      key: "publicUrl",
      label: "App URL",
      format: (v) => (v === null ? color.dim("— (no canonical URL yet)") : String(v))
    }
  ]);

  if (edgeToken.publicUrl !== null) {
    console.log("");
    console.log(color.dim("Reach the app with:"));
    console.log(`  curl -H '${edgeToken.headerName}: ${edgeToken.token}' ${edgeToken.publicUrl}`);
  }

  console.log("");
  console.log(
    color.yellow("This is a live credential — anyone holding it reaches the app. Do not commit it.")
  );

  // Owned by the printer, not the caller, so the JSON payload and the human
  // warning cannot disagree about whether a tool was just broken. Rotation
  // invalidates the token baked into a registered tool, and that is the one
  // consequence an operator cannot infer from a successful-looking response.
  if (toolResyncRequired === true) {
    console.log(
      color.yellow(
        "This app is registered as a tool. Re-register it — the token it sends is now the old one."
      )
    );
  }
}

function colorApprovalStatus(status: string): string {
  if (status === "APPROVED") return color.green(status);
  if (status === "REJECTED" || status === "EXPIRED") return color.red(status);
  return color.yellow(status); // PENDING
}

// Full id (not shortenId): `approvals get/decide` take the deployment id
// and this queue is the only way to discover which deployments are gated.
function printApprovalRequestList(data: ListPendingApprovalsResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.requests.length === 0) {
    console.log(color.dim("No pending approvals."));
    return;
  }

  const rows = data.requests.map((r) => ({
    deploymentId: r.vibeDeploymentId,
    status: colorApprovalStatus(r.status),
    requiredApprovals: r.requiredApprovals,
    expiresAt: formatTimestamp(r.expiresAt),
    createdAt: formatTimestamp(r.createdAt)
  }));

  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "deploymentId", label: "Deployment" },
    { key: "status", label: "Status" },
    { key: "requiredApprovals", label: "Required" },
    { key: "expiresAt", label: "Expires" },
    { key: "createdAt", label: "Created" }
  ]);
}

function printApprovalRequest(request: VibeApprovalRequestDto): void {
  printRecord(request as unknown as Record<string, unknown>, [
    { key: "id", label: "Request id" },
    { key: "vibeDeploymentId", label: "Deployment" },
    { key: "status", label: "Status", format: (v) => colorApprovalStatus(String(v)) },
    { key: "requiredApprovals", label: "Required" },
    { key: "expiresAt", label: "Expires", format: (v) => formatTimestamp(String(v)) },
    {
      key: "decidedAt",
      label: "Decided",
      format: (v) => (v === null ? "—" : formatTimestamp(String(v)))
    },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) }
  ]);
}

function printDecisionTable(decisions: VibeApprovalDecisionDto[]): void {
  if (decisions.length === 0) {
    console.log(color.dim("\nNo decisions yet."));
    return;
  }
  console.log(color.bold("\nDecisions"));
  const rows = decisions.map((d) => ({
    decision: d.decision === "APPROVE" ? color.green(d.decision) : color.red(d.decision),
    decidedBy: d.decidedByUserId ?? color.dim("(deleted user)"),
    note: d.note === null ? color.dim("—") : truncate(d.note.replace(/\s+/g, " "), 48),
    decidedAt: formatTimestamp(d.decidedAt)
  }));
  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "decision", label: "Decision" },
    { key: "decidedBy", label: "Decided by" },
    { key: "note", label: "Note" },
    { key: "decidedAt", label: "Decided" }
  ]);
}

function printApprovalWithDecisions(data: GetApprovalResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  printApprovalRequest(data.request);
  printDecisionTable(data.decisions);
}

function printDecisionResult(data: RecordApprovalDecisionResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const verb = data.decision.decision === "APPROVE" ? "Approved" : "Rejected";
  console.log(
    `${color.green("✓")} ${verb} — request is now ${colorApprovalStatus(data.request.status)}`
  );
  printApprovalRequest(data.request);
}

function printVibeGitProject(project: VibeGitProjectDto): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(project, null, 2));
    return;
  }

  printRecord(project as unknown as Record<string, unknown>, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "defaultBranch", label: "Default branch" },
    { key: "status", label: "Status" },
    {
      key: "gitRemoteUrl",
      label: "Build source",
      format: (v) => (v === null ? "—" : String(v))
    },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => formatTimestamp(String(v)) }
  ]);
  console.log("");
  console.log(color.dim("To push to this project, run: nexus vibe git-credentials"));
}

function printVibeGitProjectList(data: ListVibeGitProjectsResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.gitProjects.length === 0) {
    console.log(color.dim("No Vibe git projects yet."));
    return;
  }

  // gitRemoteUrl is deliberately absent: it is the build executor's in-VPC
  // address, unreachable from a user's machine, and at 40 columns it crowded
  // out the fields a list is actually scanned for. `status` already carries
  // whether the repo materialized. The push URL comes from git-credentials.
  // Full id: `git-project get <projectId>` and `git-project reprovision
  // <projectId>` take it.
  const rows = data.gitProjects.map((p) => ({
    id: p.id,
    name: p.name,
    defaultBranch: p.defaultBranch,
    status: p.status,
    createdAt: formatTimestamp(p.createdAt)
  }));

  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "id", label: "Id" },
    { key: "name", label: "Name", width: 24 },
    { key: "defaultBranch", label: "Default branch", width: 16 },
    { key: "status", label: "Status", width: 10 },
    { key: "createdAt", label: "Created", width: 21 }
  ]);
  console.log("");
  console.log(color.dim("To push to a project, run: nexus vibe git-credentials"));
}

/** Render the first 8 chars of an id so the table stays readable. */
/**
 * Shorten an id for DISPLAY ONLY — never for an id the user has to type
 * back.
 *
 * Every `vibe` command that takes an id takes the full uuid, and the API
 * rejects anything else. So a shortened id in a list is a trap: it is the
 * only id the reader has, it looks complete enough to copy, and pasting it
 * back fails. Reserve this for ids no command accepts (actor / decider
 * user ids), and print command-argument ids in full.
 */
function shortenId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Trim trailing milliseconds off the ISO timestamp the backend
 * emits — `2026-05-27T12:34:56.789Z` → `2026-05-27 12:34:56Z` —
 * so the table column doesn't dominate the row width.
 */
function formatTimestamp(iso: string): string {
  const stripped = iso.replace(/\.\d{3}Z$/, "Z").replace("T", " ");
  return stripped;
}

function colorizeEventType(t: AuditEventType): string {
  if (t === "COST_SAFETY_AUTO_SUSPENDED" || t === "DEPLOYMENT_ROLLED_BACK_COST_SAFETY") {
    return color.red(t);
  }
  if (t === "DEPLOYMENT_REJECTED" || t === "APPROVAL_EXPIRED") return color.yellow(t);
  if (t === "DEPLOYMENT_APPROVED") return color.green(t);
  return t;
}

/**
 * Per-event-type "details" column. Picks the field set that most
 * directly answers "what should I look at first?" for each event:
 *   - DEPLOYMENT_TRIGGERED → sha + gated marker
 *   - DEPLOYMENT_APPROVED/REJECTED → decider + decisive flag + note
 *   - APPROVAL_EXPIRED → request id
 *   - COST_SAFETY_AUTO_SUSPENDED → usageType + breachedSum/cap + period
 *   - DEPLOYMENT_ROLLED_BACK_COST_SAFETY → priorStatus + reason
 *
 * Discriminated-union narrowing means an exhaustiveness gap would
 * surface as a TypeScript error here, not a silent runtime branch.
 */
function formatPayloadDetails(payload: AuditPayload): string {
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
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
