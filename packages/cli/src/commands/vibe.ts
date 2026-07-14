/**
 * `nexus vibe …` — tenant-scoped Vibe (Nexus Git + internal deployment
 * platform) commands. Authenticate with the org API key, same as the
 * rest of the tenant CLI.
 *
 * v1 scope: `audit list` (read the per-org audit feed), the `app` group
 * (create / list / get / update / register-as-tool), `deploy` (trigger a
 * deployment), and the `deployments` group (list / get). Approval /
 * template commands land in later slices.
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

import { Command } from "commander";

import { handleError } from "../errors";
import { color, isJsonMode, printPaginationMeta, printRecord, printTable } from "../output";
import { type TenantHttpOptions, tenantRequest } from "../util/tenant-http";

// ============================================================
// Wire types — mirror packages/types/src/api/domains/vibe/schemas/
// audit-events.schemas.ts. The CLI is published as a standalone npm
// package; `@nexus/types` isn't a runtime dep. Keep these in lockstep
// when the schema evolves.
// ============================================================

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

/** Subset of VibeGitProjectSchema the CLI renders. */
interface VibeGitProjectDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  s3Prefix: string;
  hookSecretRef: string;
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
interface VibeDeploymentDto {
  id: string;
  vibeAppId: string;
  color: string;
  status: string;
  triggerSha: string;
  imageRef: string;
  errorReason: string | null;
  createdAt: string;
}

/** Subset of VibeBuildJobSchema the CLI renders. */
interface VibeBuildJobDto {
  id: string;
  vibeDeploymentId: string;
  status: string;
  builder: string;
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

interface TriggerDeploymentResponse {
  deployment: VibeDeploymentDto;
  buildJob: VibeBuildJobDto;
  approvalRequest: VibeApprovalRequestDto | null;
}

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
  app              Manage Vibe apps — create, list, get, update, register as a tool.
  git-project      Manage git projects — the standalone code store apps deploy from.
  git-credentials  Fetch your tenant git push token + clone address.
  deploy           Trigger a deployment for an app from a commit sha.
  deployments      List / inspect an app's deployments and their build jobs.
  env              Manage an app's plaintext env vars — list, set, remove.
  approvals        Review gated deployments — pending queue, get, approve/reject.
  audit            Inspect the per-org Vibe audit feed (deployments, approvals,
                   cost-safety state changes, rollbacks).

This surface is feature-flagged — your org must have the VIBE feature
flag enabled. If you get a 403, ping platform-ops to flip the flag.
`
    );

  registerAppCommands(vibe, program);
  registerGitProjectCommands(vibe, program);
  registerGitCredentialsCommand(vibe, program);
  registerDeployCommand(vibe, program);
  registerDeploymentsCommands(vibe, program);
  registerEnvCommands(vibe, program);
  registerApprovalsCommands(vibe, program);
  registerAuditCommands(vibe, program);
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
  $ nexus vibe env list 11111111-…
  $ nexus vibe env list 11111111-… --json | jq '.envVars[].name'
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
  $ nexus vibe env set 11111111-… LOG_LEVEL=debug
  $ nexus vibe env set 11111111-… DATABASE_URL=postgres://… --scope PROD
  $ nexus vibe env set 11111111-… FEATURE_OFF=
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
  $ nexus vibe env rm 11111111-… 22222222-…
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
  $ nexus vibe approvals get 11111111-… 22222222-…
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
  $ nexus vibe approvals decide 11111111-… 22222222-… --approve
  $ nexus vibe approvals decide 11111111-… 22222222-… --reject --note "needs a migration first"
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
      "--builder <kind>",
      "Build strategy: nixpacks or dockerfile. Omit to let the runner auto-detect."
    )
    .addHelpText(
      "after",
      `
Triggers one push→build→deploy attempt: the deployment lands in BUILDING
and its sibling build job in PENDING; the build + deploy runners carry it
forward asynchronously. If the app has approvals enabled, the deploy waits
in AWAITING_APPROVAL until a reviewer decides.

Examples:
  $ nexus vibe deploy 11111111-… --sha 1a2b3c4
  $ nexus vibe deploy 11111111-… --sha 1a2b3c4d…full40 --builder dockerfile
`
    )
    .action(async (appId: string, cmdOpts: { sha: string; builder?: string }) => {
      try {
        const triggerSha = resolveTriggerSha(cmdOpts.sha);
        const builder = resolveBuilder(cmdOpts.builder);
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<TriggerDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments`,
          body: { triggerSha, builder }
        });
        printTriggeredDeployment(data, appId);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
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
  $ nexus vibe app update 11111111-… --deploy-branch release/prod
  $ nexus vibe app update 11111111-… --require-approvals true
  $ nexus vibe app update 11111111-… --resource-quotas '{"cpuMhz":1000,"memoryMiB":1024,"maxInstances":5}'
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
  $ nexus vibe app register-as-tool 11111111-… --spec-file ./openapi.json
  $ nexus vibe app register-as-tool 11111111-… --spec-file ./api.yaml --name "Orders API"
  $ nexus vibe app register-as-tool 11111111-… --spec-file ./openapi.json --json | jq .id
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
  $ nexus vibe app provision-repo 11111111-… --git-url file:///tmp/my-repo
  $ nexus vibe app provision-repo 11111111-… --git-url https://github.com/acme/svc.git
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
  $ nexus vibe app reprovision-repo 11111111-…
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
  $ nexus vibe git-project get 11111111-…
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

Choose the name deliberately: a name taken in your org returns 409, and there
is no way to release one yet — projects cannot currently be deleted. Naming a
standalone project after an app you have not created yet will block that app
from provisioning its own repo later.

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
Shows the project's lifecycle status and its clone URL. A PENDING project has
not been materialized on the git host yet; READY is serving. FAILED means
materialization failed — retry it with "git-project reprovision".

Examples:
  $ nexus vibe git-project get 11111111-…
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
  $ nexus vibe git-project reprovision 11111111-…
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
  $ nexus vibe audit list --type DEPLOYMENT_TRIGGERED --app 11111111-…
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
    id: shortenId(e.id),
    createdAt: formatTimestamp(e.createdAt),
    eventType: colorizeEventType(e.payload.eventType),
    vibeAppId: e.vibeAppId === null ? color.dim("—") : shortenId(e.vibeAppId),
    actor: e.actorUserId === null ? color.dim("system") : shortenId(e.actorUserId),
    details: formatPayloadDetails(e.payload)
  }));

  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "id", label: "Id", width: 10 },
    { key: "createdAt", label: "Created" },
    { key: "eventType", label: "Event" },
    { key: "vibeAppId", label: "App", width: 10 },
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
function resolveTriggerSha(raw: string): string {
  const sha = raw.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    throw new Error(`Invalid --sha "${raw}". Expected 7–40 hexadecimal characters.`);
  }
  return sha;
}

/** Map the friendly --builder value to the API enum; undefined = auto-detect. */
function resolveBuilder(raw: string | undefined): "NIXPACKS" | "DOCKERFILE" | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "nixpacks") return "NIXPACKS";
  if (v === "dockerfile") return "DOCKERFILE";
  throw new Error(`Invalid --builder "${raw}". Expected "nixpacks" or "dockerfile".`);
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

function printTriggeredDeployment(data: TriggerDeploymentResponse, appId: string): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const d = data.deployment;
  console.log(color.green("✓") + " Deployment triggered");
  printRecord({ ...d, builder: data.buildJob.builder } as unknown as Record<string, unknown>, [
    { key: "id", label: "Deployment" },
    { key: "status", label: "Status" },
    { key: "color", label: "Slot" },
    { key: "triggerSha", label: "Commit", format: (v) => String(v).slice(0, 7) },
    { key: "builder", label: "Builder" },
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

  const rows = data.deployments.map((d) => ({
    id: shortenId(d.id),
    status: colorizeStatus(d.status),
    slot: d.color,
    commit: d.triggerSha.slice(0, 7),
    createdAt: formatTimestamp(d.createdAt)
  }));

  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "id", label: "Id", width: 10 },
    { key: "status", label: "Status" },
    { key: "slot", label: "Slot" },
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
    { key: "status", label: "Status", format: (v) => colorizeStatus(String(v)) },
    { key: "color", label: "Slot" },
    { key: "triggerSha", label: "Commit", format: (v) => String(v).slice(0, 7) },
    { key: "imageRef", label: "Image", format: (v) => (v === "" ? "—" : String(v)) },
    { key: "errorReason", label: "Error", format: (v) => (v === null ? "—" : String(v)) },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) }
  ]);

  if (data.buildJob === null) {
    console.log(color.dim("\nNo build job."));
    return;
  }

  const b = data.buildJob;
  console.log(color.bold("\nBuild job"));
  printRecord(b as unknown as Record<string, unknown>, [
    { key: "id", label: "Id" },
    { key: "status", label: "Status", format: (v) => colorizeStatus(String(v)) },
    { key: "builder", label: "Builder" },
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

  const rows = data.apps.map((a) => ({
    id: shortenId(a.id),
    name: a.name,
    deployBranch: a.deployBranch,
    approvals: a.requireApprovals ? color.yellow("required") : color.dim("off"),
    publicUrl: a.publicUrl ?? color.dim("—"),
    createdAt: formatTimestamp(a.createdAt)
  }));

  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "id", label: "Id", width: 10 },
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
      key: "visibility",
      label: "Visibility",
      format: (v) => (v === "PUBLIC" ? "public (browser-reachable)" : "private (agent-tool only)")
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
    { key: "gitRemoteUrl", label: "Git URL", format: (v) => (v === null ? "—" : String(v)) },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => formatTimestamp(String(v)) }
  ]);
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

  const rows = data.gitProjects.map((p) => ({
    id: shortenId(p.id),
    name: p.name,
    defaultBranch: p.defaultBranch,
    status: p.status,
    gitRemoteUrl: p.gitRemoteUrl ?? color.dim("—"),
    createdAt: formatTimestamp(p.createdAt)
  }));

  printTable(rows as unknown as Record<string, unknown>[], [
    { key: "id", label: "Id", width: 10 },
    { key: "name", label: "Name", width: 24 },
    { key: "defaultBranch", label: "Default branch", width: 16 },
    { key: "status", label: "Status", width: 10 },
    { key: "gitRemoteUrl", label: "Git URL", width: 40 },
    { key: "createdAt", label: "Created", width: 21 }
  ]);
}

/** Render the first 8 chars of an id so the table stays readable. */
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
