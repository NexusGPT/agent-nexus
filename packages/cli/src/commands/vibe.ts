/**
 * `nexus vibe …` — tenant-scoped Vibe (Nexus Git + internal deployment
 * platform) commands. Authenticate with the org API key, same as the
 * rest of the tenant CLI.
 *
 * v1 scope: `audit list` (read the per-org audit feed), the `app` group
 * (create / list / get / update / delete / visibility / edge-token /
 * rotate-edge-token / register-as-tool), the `git-project` group (create /
 * list / get / clone / pull / reprovision / delete), `deploy` (trigger a
 * deployment), and the
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

import { timeoutSecondsToMs } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import {
  color,
  isJsonMode,
  printPaginationMeta,
  printRecord,
  printTable,
  type RecordField
} from "../output";
import { confirmable, confirmDestructive, promptLine, promptStream } from "../util/confirm";
import { type TenantHttpOptions, tenantRequest } from "../util/tenant-http";
import {
  VIBE_AUDIT_EVENT_TYPES,
  type VibeAuditEventType
} from "../vibe-audit-event-types.generated";
import {
  isVibeAllowedRegion,
  VIBE_ALLOWED_REGIONS,
  type VibeTenantClusterStatus
} from "../vibe-regions";
import {
  type AuditPayload,
  type AuditPayloadUnmodelled,
  type CreateVibeAppResponse,
  type DeletedIdResponse,
  type DeleteEnvVarResponse,
  type ExternalToolDetail,
  type GetApprovalResponse,
  type GetDeploymentResponse,
  type GetDeployStateResponse,
  type GetEdgeTokenResponse,
  type GetGitCredentialsResponse,
  type GetVibeAppLogsResponse,
  type GetVibeAppResponse,
  isAuditEventType,
  isVibeEnvVarScope,
  type ListAuditEventsResponse,
  type ListDeploymentsResponse,
  type ListEnvVarsResponse,
  type ListPendingApprovalsResponse,
  type ListVibeAppsResponse,
  type ListVibeGitProjectsResponse,
  type RecordApprovalDecisionResponse,
  type RollbackAppResponse,
  type RotateEdgeTokenResponse,
  type SetVisibilityResponse,
  type SingleVibeAppResponse,
  type SingleVibeGitProjectResponse,
  type StandaloneVibeGitProjectResponse,
  type TriggerDeploymentResponse,
  type UpsertEnvVarResponse,
  VIBE_DEFAULT_CONTAINER_PORT,
  VIBE_ENV_VAR_SCOPES,
  type VibeAppCardBindingDto,
  type VibeAppDeployability,
  type VibeAppDto,
  type VibeAppEnvelopeExtras,
  type VibeAppEnvVarDto,
  type VibeAppGitProjectSummaryDto,
  type VibeApprovalDecisionDto,
  type VibeApprovalDecisionKind,
  type VibeApprovalRequestDto,
  type VibeEdgeTokenDto,
  type VibeEnvVarScope,
  type VibeGitCredentialsDto,
  type VibeGitProjectAliasDto,
  type VibeShipGateMode
} from "../vibe-wire-types";
import { VIBE_REGISTER_APP_AS_TOOL_CONTRACT } from "./vibe.contract.generated";
import {
  type AppLogsFlags,
  emitLogLines,
  orderForDisplay,
  resolveAppLogsRequest,
  runAppLogsFollow,
  toLogQuery,
  VIBE_LOG_CLI_DEFAULT_SINCE,
  VIBE_LOG_CLI_LIMIT_HELP
} from "./vibe-app-logs";
import { qualifyRefName, renderDeployState } from "./vibe-deploy-state";
import {
  assertGitAvailable,
  assertGitRepository,
  buildCloneArgs,
  buildPullArgs,
  composeCloneUrl,
  resolveCloneDirectory,
  runGitWithCredential
} from "./vibe-git-local";
import { reportWatchOutcome, WATCH_DEFAULTS, watchDeployment } from "./vibe-watch";

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
  deploy-state     Did my push land, and is what I pushed what is live?
  rollback         Roll an app back to its previous healthy version.
  deployments      List / inspect an app's deployments and their build jobs.
  env              An app's environment — list, set and remove plaintext vars,
                   and read the access cards imported into it.
  approvals        Review gated deployments — pending queue, get, approve/reject.
  audit            Inspect the per-org Vibe audit feed (deployments, approvals,
                   cost-safety state changes, rollbacks).

🚨 THIS NAMESPACE PROVISIONS REAL CLOUD INFRASTRUCTURE THAT COSTS MONEY AND
OUTLIVES THE COMMAND. A cluster, a git host and every running deployment keep
consuming until something removes them; nothing here is a sandbox and nothing
expires on its own. Treat "cluster provision", "app create", "deploy" and
"app provision-repo" as spend, and clean up what you were only trying out.

THE SUBCOMMANDS ARE LISTED ALPHABETICALLY AND THAT IS NOT THE ORDER TO RUN THEM.
End to end, once the cluster exists:

  1. vibe app create                    the app record
  2. vibe app provision-repo            a new repo — or attach-repo for one you have
  3. vibe git-credentials               your push token AND the address to push to
  4. vibe git-project clone             then commit and push with plain git —
                                        there is no "git-project commit" or
                                        "git-project push" verb, and the remote
                                        comes from step 3
  5. vibe deploy                        names the commit sha to build
  6. vibe deploy-state                  did the push land, is it what is live
  7. vibe app register-as-tool          only once a deployment is healthy

Each step's own --help is right about its step; nothing but this list says how
they compose.

This surface is feature-flagged — your org must have the VIBE feature
flag enabled. If you get a 403, ping platform-ops to flip the flag.
`
    );

  registerClusterCommands(vibe, program);
  registerAppCommands(vibe, program);
  registerGitProjectCommands(vibe, program);
  registerGitCredentialsCommand(vibe, program);
  registerDeployCommand(vibe, program);
  registerDeployStateCommand(vibe, program);
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
Notes:
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
Notes:
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
    .addHelpText(
      "after",
      `
Notes:
The Id column is never truncated, because "vibe deployments get <appId>
<deploymentId>" takes it — this listing is where that second id comes from.

Commit is shortened to seven characters for the table. The full trigger sha is
in --json.

Version counts up per app, so v1 is that app's first deployment and the newest
row carries the highest number.

An app with no deployments prints one dim line rather than an empty table.

Examples:
  $ nexus vibe deployments list 11111111-2222-4333-8444-555555555555
  $ nexus vibe deployments list 11111111-2222-4333-8444-555555555555 --json
`
    )
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
    .addHelpText(
      "after",
      `
Notes:
TWO RECORDS, NOT ONE. The deployment prints first and its build job second, and
the build job is where Logs, Builder and Duration live. A deployment that never
reached a build prints "No build job." instead of a second record.

THIS IS THE BUILD LOG, and "vibe app logs" is the APPLICATION log. If you are
looking for what the container printed after it started, that is the other
command.

Detected port answers the question that usually brings you here. It reads "not
detected — using <default>" rather than a dash, because a dash would say
"nothing to show" when the real fact is that the build observed no port and a
default therefore applies.

A deployment built with --force-rebuild says so, which is what explains the -v
suffix on its image tag.

Examples:
  $ nexus vibe deployments get 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa
  $ nexus vibe deployments get 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa --json
`
    )
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
  const env = vibe
    .command("env")
    .description("Manage an app's plaintext env vars, and read its imported access cards");

  env
    .command("list <appId>")
    .description("List an app's environment (all scopes), ordered by scope then name")
    .addHelpText(
      "after",
      `
One table, one row per name, because the app sees one environment. The
Source column says what backs each row:

  variable  A plaintext env var. Set and removed with the two verbs below.
  card      An access card imported into this app's environment. READ-ONLY
            here — see below.

Values are plaintext — secrets do NOT belong there (a separate secret-ref
surface lands with the Vault wiring). Long values are truncated in the
table; use --json for the full value.

A card row's value is a handle (nxc_…), not a secret: it is an address the
app resolves through the broker, which re-authorizes the app on every call.
The Status column is the one to read — only "active" projects, and every
other state makes the next deployment refuse that entry by name.

Cards are imported from the console, never from here, and that is the route's
shape rather than a missing feature: importing a card delegates a person's
credential authority, so the import route accepts no API key at all — and an
API key is the only credential this CLI holds.

Older servers do not report cards. They answer with variables only and this
table has no card rows, which is not the same as an app having no cards.

Examples:
  $ nexus vibe env list 11111111-2222-4333-8444-555555555555
  $ nexus vibe env list 11111111-2222-4333-8444-555555555555 --json | jq '.envVars[].name'
  $ nexus vibe env list 11111111-2222-4333-8444-555555555555 --json | jq '.cardBindings[] | select(.status != "ACTIVE")'

Notes:
  THE Card COLUMN NAMES WHOSE AUTHORITY A CARD ROW CARRIES — the credential
  first, because that is what its owner recognises as theirs, then the access
  card that attenuates it. On a "variable" row it reads "—", which means the
  column DOES NOT APPLY, never that a card is missing or unset.
  THE Scope COLUMN IS ALL, PROD OR STAGING, and the table is sorted by it in the
  order the deployer resolves: ALL first, then the scope that overwrites it by
  name. A scope this CLI does not recognise sorts to the TOP rather than being
  buried in the middle. Which scope a deployment actually reads is on
  "nexus vibe env set".`
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

Notes:
  ⚠️ THE SCOPE IS PART OF THE KEY, SO THE SAME NAME CAN EXIST TWICE AND NEITHER
  ROW OVERWRITES THE OTHER. Setting DATABASE_URL at ALL and again at PROD leaves
  two rows, both stored, and "env list" prints both without marking which one
  wins.
  WHAT THE RUNNING APP READS IS ALL UNION PROD, WITH PROD WINNING ON A NAME
  COLLISION — AND STAGING REACHES NOTHING. The projection takes every ALL row,
  lets every PROD row overwrite by name, and drops STAGING entirely, so a
  STAGING row is set, visible in "env list", and read by no deployment. The tell
  is a value that never takes effect while the table shows it plainly.
  Keep each NAME at exactly ONE scope anyway: ALL for a value that never varies,
  PROD for one that does. Two rows for one name is legal, resolvable and
  unreadable at a glance — delete the loser with "vibe env rm".

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
Notes:
Removal is by env-var id, not name — list first to get the id. Scoped to
your org + the named app; a wrong id returns 404.

Variables only. A card row's id is a binding id and this route does not
know it, so it answers 404 — revoke a card from the console instead.

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
Notes:
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
Notes:
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
Notes:
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

That push succeeds against a repo you have already pushed to. It does NOT
succeed as your very FIRST push from a local repo you started yourself: every
project's repo is created with an initial commit already on it, so your first
push is a non-fast-forward and git rejects it with a bare "fetch first".

Nothing on the git host can explain that rejection when it happens — git
decides it locally, on your machine, and never contacts the server. So take
one of these instead:
  $ nexus vibe git-project clone <projectId>          # start from the repo
  $ git fetch origin && git rebase origin/<branch>    # keep local work you have

The pushToken is a LIVE SECRET — it grants git push to your repos. Treat the
whole payload as sensitive (don't paste it into shared logs).

Returns 404 if your org has no dedicated git host, 409 if the host has not
finished provisioning yet (retry shortly).

Examples:
  $ nexus vibe git-credentials
  $ nexus vibe git-credentials --json | jq -r '.cloneUrlBase'

Notes:
  THE "Org" ROW IS NOT YOUR NEXUS ORGANIZATION. forgejoOrg is the path segment
  every tenant repository lives under on the git host — <host>/<org>/<repo>.git
  — and it is already baked into cloneUrlBase. Nothing addresses a Nexus org by
  it, so substituting your organization id there builds a URL that 404s.
  gitHostName ("Git host") is that host's DNS name alone, with no scheme and no
  org segment. Compose a remote from cloneUrlBase; reach for gitHostName only
  where something wants the bare hostname — a credential-helper entry, an
  allowlist, a "git ls-remote" against one repo.
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

  printRecord(creds, [
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
  console.log("");
  // The last surface before a push, and therefore the last chance to say this:
  // the rejection itself is client-side, so no hook on the git host can carry
  // the cause. Whoever skipped the provisioning output still passes through here.
  console.log(
    color.yellow('Repos are created seeded, so a virgin first push is rejected with "fetch first".')
  );
  console.log(
    color.dim("Clone the project (nexus vibe git-project clone <id>), or rebase onto it first.")
  );
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
    .option(
      "--skip-verification",
      "Ship even though the app requires its verification artifacts to be green."
    )
    .addHelpText(
      "after",
      `
Notes:
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

--skip-verification ships past the server-side gate on an app that has
verification turned on. Without it, such a deploy is REFUSED after its
build succeeds if the repo's declared artifacts (docs/feature-manifest.md,
docs/DESIGN.md, docs/SPEC.md, journeys/.last-pass, docs/COVERAGE.md) are
missing at the deployed commit, or if COVERAGE.md records a FAIL/BLOCKED
journey. The refusal is terminal FAILED and names the artifacts.

It is a DELIBERATE, RECORDED bypass, not a quiet one: it writes a
DEPLOYMENT_VERIFICATION_OVERRIDDEN audit row naming you and the commit. On
an app that does not require verification it changes nothing and records
nothing. Nothing is rebuilt either way — the gate runs after the build, so
the image already exists and an override ships it as-is.

Examples:
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4d…full40
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --confirm-overage
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --watch
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --force-rebuild
  $ nexus vibe deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --skip-verification
`
    )
    .action(
      async (
        appId: string,
        cmdOpts: {
          sha: string;
          confirmOverage?: boolean;
          watch?: boolean;
          forceRebuild?: boolean;
          skipVerification?: boolean;
        }
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
            // reused image they asked to replace and look like it worked —
            // and one that drops --skip-verification would be refused by the
            // gate the operator just chose to pass.
            `nexus vibe deploy ${appId} --sha ${cmdOpts.sha}` +
              `${cmdOpts.forceRebuild === true ? " --force-rebuild" : ""}` +
              `${cmdOpts.skipVerification === true ? " --skip-verification" : ""}` +
              ` --confirm-overage`,
            cmdOpts.confirmOverage === true,
            cmdOpts.forceRebuild === true,
            cmdOpts.skipVerification === true
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
// vibe deploy-state
// ============================================================

/**
 * The push-to-deploy answer, in one call — see `vibe-deploy-state.ts` for why
 * the rendering is a separate, pure module.
 *
 * A thin wrapper on purpose: the endpoint already carries a discriminated
 * `outcome` and the served-artifact identity, so this command adds a way to
 * REACH them and nothing else. Shipping the endpoint without one left every
 * client back on parsing `git push` stdout, which is the defect the endpoint
 * was built to retire.
 */
function registerDeployStateCommand(vibe: Command, program: Command): void {
  vibe
    .command("deploy-state <appId>")
    .description("Did my push land, and is what I pushed what is live?")
    .option(
      "--sha <sha>",
      "Ask about one exact commit (7–40 hex chars). Preferred right after a push — it stays correct once the ref advances."
    )
    .option(
      "--ref <ref>",
      "Ask about a ref's current head. A bare branch name is expanded to refs/heads/<name>; pass refs/tags/<name> for a tag."
    )
    .addHelpText(
      "after",
      `
One read of the control plane replaces parsing 'git push' output — which
cannot be done reliably: rejection lines print FIRST (so piping through
'tail' destroys them), '-q' hides the success report but not the failure
one, a backgrounded push carries no outcome at all, and an error quoting a
remote URL looks exactly like a success report.

Branch on 'outcome', never on the exit code. This command exits 0 whenever
the QUESTION was answered; NOT_RECEIVED is a successful read of a bad
situation, not a failed command. (The verb that branches on exit code is
'vibe deploy --watch'.)

  DEPLOYED               a deployment exists for this commit
  RECEIVED_NOT_DEPLOYED  the push landed and nothing deployed it
  NOT_RECEIVED           no ref head carries this commit
  REF_UNKNOWN            that ref has never been pushed to
  NO_REPOSITORY          the app has no git project attached

Live vs Served — the distinction the output exists to keep apart:

  Live    the newest HEALTHY deployment. That is the ALLOCATION's verdict
          and it lands BEFORE the edge swaps, so it is not "what the URL
          returns".
  Served  the deployment the edge was last OBSERVED answering with, always
          printed with the age of that observation. Nothing re-checks it,
          so an old observation says nothing about the present.

'Not proven served' NEVER means 'not serving'. The proof sweep only
considers a recently-healthy deployment, so a slow swap — or an app the
probe cannot reach — stays unproven permanently while serving fine.

--sha and --ref are two different questions and cannot be combined. Pass
neither to ask about the app's own deploy branch, which is what someone who
just ran 'git push' wants and cannot always name.

Examples:
  $ nexus vibe deploy-state 11111111-2222-4333-8444-555555555555
  $ nexus vibe deploy-state 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4
  $ nexus vibe deploy-state 11111111-2222-4333-8444-555555555555 --ref main
  $ nexus vibe deploy-state 11111111-2222-4333-8444-555555555555 --json

Notes:
  EACH OUTCOME NAMES A DIFFERENT FIX, AND ONLY ONE OF THEM IS ABOUT THE PUSH.
    NO_REPOSITORY          "vibe app attach-repo <appId> <gitProjectId>", then
                           re-run this. "vibe git-project list" finds the id.
    RECEIVED_NOT_DEPLOYED  the push LANDED, so nothing about it needs redoing.
                           Three causes: it went to a branch that is not the
                           app's deploy branch ("vibe app update
                           --deploy-branch"); no app is attached to the project
                           it went to ("vibe app attach-repo"); or the org is
                           suspended ("vibe audit list --type
                           COST_SAFETY_AUTO_SUSPENDED").
    NOT_RECEIVED           ask about the REF instead — "--ref <branch>". Ref
                           rows record HEADS, so a commit that landed and was
                           then pushed past reads exactly like one that never
                           arrived.
    REF_UNKNOWN            nothing was ever pushed to that ref. Check the
                           spelling before checking the server.
    DEPLOYED               nothing to fix; read the status lines under it.
`
    )
    .action(async (appId: string, cmdOpts: { sha?: string; ref?: string }) => {
      try {
        // Refused here rather than at the server so the message names the two
        // flags the caller typed. The backend refuses it too — this is the
        // round trip, not the guarantee.
        if (cmdOpts.sha !== undefined && cmdOpts.ref !== undefined) {
          throw new Error(
            "pass --sha or --ref, never both — they are two different questions and there is no single answer to both"
          );
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetDeployStateResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deploy-state`,
          query: {
            sha: cmdOpts.sha,
            ref: cmdOpts.ref === undefined ? undefined : qualifyRefName(cmdOpts.ref)
          }
        });

        if (isJsonMode()) {
          // The wire envelope, untouched — the discriminator and the served
          // observation are what a jq consumer is here for.
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(renderDeployState(data, Date.now()).join("\n"));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
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
      "--skip-verification",
      "With --to: ship even though the app requires its verification artifacts to be green."
    )
    .option(
      "--confirm-overage",
      "Only with --to: confirm the redeploy may exceed the org's usage soft limit."
    )
    .option("--watch", "Block until the restored version is healthy AND served, then exit 0.")
    .addHelpText(
      "after",
      `
Notes:
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
        cmdOpts: {
          to?: string;
          confirmOverage?: boolean;
          watch?: boolean;
          skipVerification?: boolean;
        }
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
              `nexus vibe rollback ${appId} --to ${cmdOpts.to}` +
                `${cmdOpts.skipVerification === true ? " --skip-verification" : ""}` +
                ` --confirm-overage`,
              cmdOpts.confirmOverage === true,
              // A `--to` rollback is an ordinary redeploy, so it meets the ship
              // gate like any other. Exposed here because the commit being
              // rolled BACK to is old and may predate the artifacts the app now
              // requires — refusing the recovery lever during an incident is
              // the wrong failure. The plain `rollback` (no --to) restores a
              // SUPERSEDED deployment without a build and never meets the gate
              // at all.
              false,
              cmdOpts.skipVerification === true
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
    .addHelpText(
      "after",
      `
Notes:
THIS IS WHERE THE APP ID COMES FROM, which is why the Id column is never
truncated: every other "vibe" verb takes that id as an argument.

The Source column earns its place by separating the two apps that look
identical in every other column — the app nobody has pushed to yet, and the app
that has no source to push to at all. "vibe app get" has room for the fix.

Approvals reads "required" or "off" and is the gate "vibe approvals" works on.
An app with no deployments yet still lists here.

An org with no apps prints one dim line; --json returns the payload either way.

Examples:
  $ nexus vibe app list
  $ nexus vibe app list --json
`
    )
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
    .addHelpText(
      "after",
      `
Examples:
  $ nexus vibe app get 11111111-2222-4333-8444-555555555555
  $ nexus --json vibe app get 11111111-2222-4333-8444-555555555555

Notes:
  THIS READ RESOLVES TWO JOINS NO OTHER APP COMMAND DOES. "deployability" and
  "gitProject" sit BESIDE the app, never on it, and create/update answer without
  them — so a script reading either off "vibe app update" gets undefined rather
  than a value.
    deployability  DEPLOYABLE, NO_SOURCE_ATTACHED or SOURCE_NOT_READY — the
                   one-field answer to "why does my URL do nothing".
    gitProject     A NESTED OBJECT {id, name, status}, or null. THERE IS NO
                   gitProjectId SCALAR on this response: parsing for one returns
                   null on a correctly attached app and reads as "no repo".
  THE "Ship gate" ROW PRINTS shipGateMode ITSELF — off, warn or enforce. warn
  means the gate reads the repository and ships the deploy anyway, so it is NOT
  off: those deploys write DEPLOYMENT_VERIFICATION_WARNED. The boolean
  requireVerification also rides the wire and is a LOSSY projection of the same
  field (warn reads false there) — do not parse it to decide whether a gate is
  running. "Ship gate: not reported by this server" means the backend predates
  the field, never that the gate is off.
  "Edge: not checked yet" IS THE COMMON CASE AND IS NOT A FAULT.
  edgeReachability stays null until the probe has seen a healthy, settled
  deployment, and edgeReachabilityAt / edgeReachabilityDetail are null with it.
  A null is never reachability.
  --json CARRIES MORE THAN THE TABLE: organizationId, createdByUserId,
  requireVerification and healthCheckConfig ride the wire and no table row
  shows them.
  The two joins are merged in at the TOP level rather than nested.`
    )
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetVibeAppResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}`
        });
        // Only claim the joins when this server actually reported them. On a
        // backend predating `deployability` the field is simply absent, and
        // rendering `Source: none` from that would assert the app has no git
        // project when nobody was asked — the exact conflation this ticket
        // exists to remove, reintroduced one layer up.
        printVibeApp(
          data.app,
          data.deployability === undefined
            ? undefined
            : { deployability: data.deployability, gitProject: data.gitProject ?? null }
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  app
    .command("logs <appId>")
    .description("Read a deployed app's runtime logs, and optionally follow them")
    .option(
      "--since <when>",
      `How far back to read: a duration (45s, 30m, 1h, 2d) or an ISO-8601 instant. Default ${VIBE_LOG_CLI_DEFAULT_SINCE}.`
    )
    .option("--until <when>", "Stop at this instant. Same grammar as --since. Default: now.")
    .option("--color <slot>", "Restrict to one deployment slot: blue or green. Default: both.")
    .option(
      "--grep <text>",
      "Keep only lines containing this LITERAL substring. Never a regular expression."
    )
    .option("--limit <n>", VIBE_LOG_CLI_LIMIT_HELP)
    .option("-f, --follow", "Keep the connection open and print lines as they arrive.")
    .addHelpText(
      "after",
      `
Notes:
Reads what the DEPLOYED app printed — application output, not build output. For
a build log, use \`nexus vibe deployments get <appId> <deploymentId>\`.

Lines print oldest-first, so time runs down the screen and a --follow continues
the same chronology.

--grep is a LITERAL substring and is never compiled as a pattern. \`--grep 'a.b'\`
matches the three characters a, dot, b — it does not match "axb".

--json emits NDJSON — ONE OBJECT PER LINE, never a JSON array — in both modes.
An array's closing bracket only exists once the stream ends, so
\`--follow --json | jq\` would hang forever on one. The shape does not change
under you depending on which flags you passed.

--follow and --until are mutually exclusive: a follow runs until you stop it.
Ctrl-C ends one cleanly and exits 0.

Examples:
  $ nexus vibe app logs 11111111-2222-4333-8444-555555555555
  $ nexus vibe app logs <appId> --since 15m --color green
  $ nexus vibe app logs <appId> --grep 'POST /webhook' --limit 500
  $ nexus --json vibe app logs <appId> --follow | jq -r '.message'
`
    )
    .action(async (appId: string, cmdOpts: AppLogsFlags) => {
      try {
        const opts = resolveTenantOpts(program);
        const request = resolveAppLogsRequest(cmdOpts, Date.now());

        if (request.follow) {
          process.exitCode = await runAppLogsFollow(opts, appId, request);
          return;
        }

        const data = await tenantRequest<GetVibeAppLogsResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/logs`,
          query: toLogQuery(request)
        });
        emitLogLines(orderForDisplay(data.lines));
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
      "--ship-gate <mode>",
      "How hard the ship gate applies. One of: off, warn, enforce. warn checks the artifacts and ships anyway."
    )
    .option(
      "--require-verification <bool>",
      "Refuse deploys whose declared verification artifacts are missing or red. One of: true, false. Two-state: cannot reach warn — use --ship-gate."
    )
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
  $ nexus vibe app update 11111111-2222-4333-8444-555555555555 --ship-gate warn
  $ nexus vibe app update 11111111-2222-4333-8444-555555555555 --resource-quotas '{"cpuMhz":1000,"memoryMiB":1024,"maxInstances":5}'

Notes:
  --ship-gate IS THE FLAG THAT REACHES ALL THREE STATES. The app stores
  shipGateMode: OFF, WARN or ENFORCE, and this flag takes off, warn or enforce
  (any case).
    off      the gate never reads the repository.
    warn     the gate reads it, records what it found, and ships the deploy
             anyway. This is the on-ramp: turn it on across a fleet, then read
             "nexus vibe audit list --type DEPLOYMENT_VERIFICATION_WARNED" to
             see how often ENFORCE would have refused before you enforce.
    enforce  a missing or red artifact refuses the deploy.
  --require-verification IS A TWO-STATE FLAG OVER A THREE-STATE FIELD, kept for
  scripts written before --ship-gate existed. true maps to ENFORCE and false to
  OFF, so it cannot reach WARN at all.
  PASSING BOTH IS REFUSED HERE, BEFORE THE REQUEST. The API resolves the
  contradiction in favour of shipGateMode — deliberately, since the boolean
  cannot express WARN — but a person who typed both flags on one command line
  made a mistake in that line, and silently discarding one of them is how the
  gate ends up in a state nobody chose. Pass --ship-gate alone.
`
    )
    .action(
      async (
        appId: string,
        cmdOpts: {
          deployBranch?: string;
          description?: string;
          requireApprovals?: string;
          // Both gate writers, and `requireVerification` was missing here while
          // `buildAppUpdateBody` read it — harmless only because every field is
          // optional, so the narrower object still satisfied the wider one and
          // the flag kept working. A field the action does not declare is a
          // field the next reader believes is unhandled.
          shipGate?: string;
          requireVerification?: string;
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

If a git project already goes by this name, the app is still created and a
warning names it: "provision-repo" mints a project named after the app, so it
would conflict on that name — use "attach-repo" to point the app at the
project that already exists.

Examples:
  $ nexus vibe app create stripe-handler
  $ nexus vibe app create orders-api --description "Order webhook handler"
  $ nexus vibe app create landing --public

Notes:
  THAT WARNING GOES TO STDERR, AND --json DOES NOT SUPPRESS IT. stdout stays the
  bare app object a jq consumer pipes, so the collision line rides the other
  stream rather than corrupting it. A script capturing stdout alone loses the
  warning in silence, and so does a "2>&1 | head" whose window the app table
  fills first. Capture stderr on its own, or find the project again with
  "nexus vibe git-project list".
`
    )
    .action(async (name: string, cmdOpts: { description?: string; public?: boolean }) => {
      try {
        const appName = resolveAppName(name);
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<CreateVibeAppResponse>(opts, {
          method: "POST",
          path: "/api/vibe/apps",
          body: {
            name: appName,
            description: cmdOpts.description,
            visibility: cmdOpts.public ? "PUBLIC" : "PRIVATE"
          }
        });
        printVibeApp(data.app);
        // The app was created; this is the collision the operator would
        // otherwise meet several commands later as a bare `provision-repo` 409.
        //
        // stderr, and unguarded by `isJsonMode()`, on purpose: stdout stays the
        // bare app object a `--json` caller pipes into jq, while a human sees
        // the warning either way. Writing it to stdout would corrupt that JSON.
        if (data.gitProjectNameCollision) {
          const p = data.gitProjectNameCollision;
          console.error(
            color.yellow(
              `A git project named "${p.name}" (${p.status}) already exists in this organization.\n` +
                `"provision-repo" mints a project named after the app, so it will conflict on that name. ` +
                `Attach the existing one instead:\n  nexus vibe app attach-repo ${data.app.id} ${p.id}`
            )
          );
        }
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
Notes:
private requires an identity on every request: an agent tool call carries
the app's edge token automatically, and a person is sent to sign in with
Nexus and admitted if the app's access list allows them. An API client with
neither gets a 401 — never a silent 404.

public requires nothing at all. Anyone with the URL opens the app, and the
app's access list stops gating anything until it is private again.

Going private mints a FRESH edge token, so a tool already registered against
this app keeps sending the old one and starts failing at the edge. Repair it
by re-pointing that tool's auth ("external-tool update-auth"), NOT with
"register-as-tool" — that refuses an app which already has a linked tool.

Re-asserting the visibility an app already has is a no-op: no token is
minted and nothing is re-published.

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

        const target = normalized === "public" ? "PUBLIC" : "PRIVATE";
        const opts = resolveTenantOpts(program);

        // Read the CURRENT visibility before writing, purely so the output can
        // tell a real flip from a no-op. `SetVibeAppVisibilityUseCase` is
        // idempotent — re-asserting the visibility an app already has returns
        // without touching anything — and a delay notice printed over that
        // would describe a propagation that is not happening.
        //
        // Best-effort: a failed pre-read must not block the write the operator
        // actually asked for, so it degrades to `null` and the notice is simply
        // omitted rather than guessed.
        let priorVisibility: "PRIVATE" | "PUBLIC" | null = null;
        try {
          const before = await tenantRequest<SingleVibeAppResponse>(opts, {
            method: "GET",
            path: `/api/vibe/apps/${encodeURIComponent(appId)}`
          });
          priorVisibility = before.app.visibility;
        } catch {
          priorVisibility = null;
        }

        const data = await tenantRequest<SetVisibilityResponse>(opts, {
          method: "PATCH",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/visibility`,
          body: { visibility: target }
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        // Something actually changed iff the visibility moved, OR a token was
        // minted. The second half is not redundant: an app that is ALREADY
        // private but carries no token gets its first one here (the use case's
        // `needsFirstToken` exception), which the edge does begin enforcing —
        // so visibility alone would report that real change as a no-op.
        const tokenMinted = data.edgeToken !== null && data.edgeToken !== undefined;
        const changed = priorVisibility !== target || tokenMinted;

        if (!changed && priorVisibility !== null) {
          console.log(color.dim(`App was already ${normalized} — nothing changed.`));
          return;
        }

        console.log(
          normalized === "public"
            ? color.green("App is now public — anyone with the URL can open it.")
            : color.green("App is now private — a sign-in or the app token is required.")
        );
        // The flip is a WRITE, not an effect. What the edge enforces comes from
        // the authz table the agent republishes each reconcile pass, so until
        // that lands the edge is still applying the PREVIOUS visibility.
        //
        // Said for both directions, but it is `→ PRIVATE` that matters: an
        // operator locking an app down is doing something they believe took
        // effect on the return of this command, and for one pass it has not.
        //
        // Printed only when something really moved — see `changed` above.
        //
        // No duration is printed. The pass is `VIBE_AGENT_RECONCILE_INTERVAL_MS`
        // (default 15s) and a tenant may run any value, so a number here would
        // be this machine's default asserted as that tenant's behaviour.
        console.log(
          color.dim(
            normalized === "public"
              ? "  Not instant — until the tenant's edge picks up the change, callers without\n" +
                  "  the token still get 401."
              : "  Not instant — until the tenant's edge picks up the change, the app stays\n" +
                  "  reachable to anyone with the URL."
          )
        );
        // The re-register warning is the one thing a user cannot recover from by
        // guessing: the old token silently stops working on a tool that looks
        // configured.
        //
        // `register-as-tool` is deliberately NOT offered as the remedy. It
        // refuses an app that already has a linked tool (409, and this warning
        // fires only when one is linked), and it requires an OpenAPI spec — so
        // a literal copy-paste of it fails twice over. Re-pointing the EXISTING
        // tool's auth is the operation that repairs this, and it is the one
        // `register-as-tool` performed when it baked the token in.
        if (data.toolResyncRequired) {
          console.log(
            color.yellow(
              "This app is registered as a tool. A fresh edge token was minted and the old one no longer works."
            )
          );
          console.log(
            color.yellow("  Re-point the tool at the new token (register-as-tool cannot — it 409s")
          );
          console.log(color.yellow("  on an app that already has one):"));
          console.log(color.dim(`    nexus vibe app edge-token ${appId}`));
          console.log(color.dim("      → the new token, and the header name to send it in"));
          console.log(color.dim(`    nexus --json vibe app get ${appId} | jq -r .linkedToolId`));
          console.log(color.dim("      → the tool to repair"));
          console.log(color.dim("    nexus external-tool update-auth <toolId> --body \\"));
          console.log(
            color.dim(
              `      '{"type":"service_http","authorization_type":"custom","custom_header_name":"<header>","apiKey":"<token>"}'`
            )
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  confirmable(app.command("delete <appId>"))
    .description("Delete a Vibe app and stop serving it")
    .addHelpText(
      "after",
      `
Notes:
The app is soft-deleted: it drops out of "app list" and out of the console at
once, and its access grants are removed so they cannot outlive it. The name is
released, so you can create a new app with the same name afterwards.

The app's git project is NOT deleted — a project can back several apps, so it
outlives any one of them. Remove it separately with "git-project delete" if
nothing else needs it.

🚨 THE APP'S ENVIRONMENT VARIABLES GO WITH IT, AND THEY ARE NOT IN THE GIT
PROJECT. "vibe env" is a sibling namespace, so it is easy to assume its rows
survive alongside the code; they do not. Every plaintext var and every imported
access card on this app becomes unreachable the moment it is deleted, and
re-creating an app with the same name does not bring them back. Copy them out
first — "nexus vibe env list <appId> --json" — if you might rebuild this app.

Examples:
  $ nexus vibe app delete 11111111-2222-4333-8444-555555555555
  $ nexus vibe app delete 11111111-2222-4333-8444-555555555555 --yes
`
    )
    .action(async (appId: string, cmdOpts: { yes?: boolean }) => {
      try {
        const ok = await confirmDestructive(`Delete app ${appId}? It will stop being served.`, {
          ...cmdOpts,
          rerun: `nexus vibe app delete ${appId} --yes`
        });
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
Notes:
A private app admits a request only when it carries this token in the
X-Vibe-App-Token header. The platform injects it automatically on agent tool
calls; this command is how everything else gets it — a partner system, a CI job,
a developer with curl or Postman.

That is the middle ground between the two extremes: the app stays private, and a
caller you hand the token to can still reach it. Going --public to unblock a
caller removes app-level auth for everyone, and is not the same trade.

A PUBLIC app has no token and this command returns 409 — it needs none, since
anyone with the URL already reaches it.

A TOKEN THAT SUDDENLY STOPS WORKING IS USUALLY A VISIBILITY FLIP, NOT AN
EXPIRY. Going public DESTROYS the token (this command then 409s); going private
again mints a FRESH one rather than restoring the old. Either direction breaks
every caller holding the previous value, including registered tools. Check
"nexus vibe app get <appId>" for the current mode before hunting for a rotation
you did not run.

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

  confirmable(app.command("rotate-edge-token <appId>"))
    .description("Mint a fresh edge token for a private app and retire the old one")
    .addHelpText(
      "after",
      `
Notes:
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
          { ...cmdOpts, rerun: `nexus vibe app rotate-edge-token ${appId} --yes` }
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

  const registerAsTool = app
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
Notes:
DEPLOY FIRST. This is the last step of the flow, not a way to set one up: an app
with no healthy deployment is refused with a 409 saying exactly that, and it is
the first thing most people hit. Run "nexus vibe deploy <appId>" and confirm
with "nexus vibe deploy-state <appId>" before coming here.

The platform owns the tool's endpoint URL — it is the app's canonical
public URL (\`VibeApp.publicUrl\`), set server-side. You cannot point the
tool at an arbitrary host. Supply exactly one of --spec-file / --spec.

The app must not already be registered
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

  // THE ONLY LEAF OF THIS NAMESPACE THE v1 CONTRACT DECLARES, and the split is a
  // property of the server rather than of this rollout: every other verb here
  // posts to the `/api/vibe/...` tenant surface, which `ZPublicApiV1` does not
  // declare, so there is nothing to derive for them. Bound here, immediately
  // after its own chain, because nothing else adds an option to this leaf — see
  // `bindCommand` on why the call must come last.
  bindCommand(registerAsTool, VIBE_REGISTER_APP_AS_TOOL_CONTRACT);

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
Notes:
Creates a git project (the standalone code store) in PENDING and attaches
the app to it; the project takes the app's name and deploy branch. The
build executor clones --git-url at the pushed sha. The git URL is optional
here and can be set at provision time only — a deploy needs it, so pass it
unless you are wiring the project up by other means.

Provisioning an app that already has a git project returns 409. If a
project's provisioning FAILED, use "reprovision-repo" to retry it.

The repo is created SEEDED — it carries an initial commit before you push
anything — so a first push from a local repo you started yourself is rejected
with a bare "fetch first". Clone the project instead, or rebase your local
work onto it; the command's output prints both forms.

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
        printVibeGitProject(data.gitProject ?? data.repository, { freshlyProvisioned: true });
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
Notes:
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
Notes:
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
        printVibeGitProject(data.gitProject ?? data.repository, { freshlyProvisioned: true });
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
Notes:
A git project is the git primitive: an org-scoped code store materialized as
a repository on your tenant's git host. It stands on its own — a project with
no app attached is a pure code store. Push to it and its refs advance; nothing
deploys, because deployment is an app's job.

Apps point at a project ("many apps → one project"), so one code store can
back several apps watching different branches. "nexus vibe app provision-repo"
is the app-centric shortcut that creates a project and attaches it in one step.

"clone" and "pull" drive a real git on this machine, so a project is usable
end-to-end from the CLI: clone it, commit, push with the remote that
"git-credentials" prints, then pull the next change back.

Examples:
  $ nexus vibe git-project create my-lib
  $ nexus vibe git-project list
  $ nexus vibe git-project get 11111111-2222-4333-8444-555555555555
  $ nexus vibe git-project clone 11111111-2222-4333-8444-555555555555 ./my-lib
  $ nexus vibe git-project pull 11111111-2222-4333-8444-555555555555 ./my-lib
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
Notes:
The name is org-unique and becomes the repository name on the git host, so it
must be a lowercase slug: start with a letter, then letters / digits / hyphens,
≤ 63 characters. It is stamped at creation and stable for the project's life.

The project lands in PENDING and your tenant materializes the repository
shortly after; "get" shows it flip to READY. (A project only materializes once
your tenant's git host is healthy — until then it simply stays PENDING.)

That repository is created SEEDED — it carries an initial commit before you
push anything — so a first push from a local repo you started yourself is
rejected with a bare "fetch first". Clone the project instead, or rebase your
local work onto it; the command's output prints both forms.

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
          printVibeGitProject(data.gitProject, { freshlyProvisioned: true });
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
Notes:
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
Notes:
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
    .command("clone <projectId> [directory]")
    .description("Clone a git project onto this machine")
    .option("--branch <branch>", "Branch to check out (default: the project's default branch).")
    .addHelpText(
      "after",
      `
Notes:
Resolves the project, fetches your org's git credential, and runs a real
"git clone" against your tenant's git host. The directory defaults to the
project's name.

The push token is NOT written into the clone's .git/config: it is passed to
git through a temporary 0600 credential file that is deleted when the command
returns, and "origin" is left as the plain token-free URL. Re-authenticate
later with "git-project pull", which supplies a fresh token the same way.

The project must be READY — a PENDING project has not materialized on the git
host yet, and cloning it would fail inside git with a much worse message.

Examples:
  $ nexus vibe git-project clone 11111111-2222-4333-8444-555555555555
  $ nexus vibe git-project clone 11111111-2222-4333-8444-555555555555 ./shared-lib
  $ nexus vibe git-project clone 11111111-2222-4333-8444-555555555555 --branch trunk
`
    )
    .action(
      async (projectId: string, directory: string | undefined, cmdOpts: { branch?: string }) => {
        try {
          assertGitAvailable();
          const opts = resolveTenantOpts(program);

          const projectData = await tenantRequest<StandaloneVibeGitProjectResponse>(opts, {
            method: "GET",
            path: `/api/vibe/git-projects/${encodeURIComponent(projectId)}`
          });
          const gitProject = projectData.gitProject;
          if (gitProject.status !== "READY") {
            throw new Error(
              `Git project "${gitProject.name}" is ${gitProject.status}, not READY — it has not materialized on your git host yet. Check "nexus vibe git-project get ${projectId}".`
            );
          }

          const credentialData = await tenantRequest<GetGitCredentialsResponse>(opts, {
            method: "GET",
            path: "/api/vibe/git-credentials"
          });

          const target = resolveCloneDirectory(directory, gitProject.name);
          const cloneUrl = composeCloneUrl(
            credentialData.credentials.cloneUrlBase,
            gitProject.name
          );
          const branch = cmdOpts.branch ?? gitProject.defaultBranch;

          runGitWithCredential(credentialData.credentials, "clone", (credentialPath) =>
            buildCloneArgs(credentialPath, cloneUrl, target, branch)
          );

          if (isJsonMode()) {
            console.log(
              JSON.stringify(
                {
                  gitProjectId: gitProject.id,
                  name: gitProject.name,
                  branch,
                  directory: target,
                  cloneUrl
                },
                null,
                2
              )
            );
            return;
          }
          console.log(`${color.green("✓")} Cloned ${gitProject.name}@${branch} into ${target}`);
          console.log(
            color.dim(`Update it later with: nexus vibe git-project pull ${projectId} ${target}`)
          );
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  project
    .command("pull <projectId> [directory]")
    .description("Fast-forward an already-cloned git project")
    .addHelpText(
      "after",
      `
Notes:
Runs "git pull --ff-only" in an existing clone, supplying a freshly-fetched
credential so the pull keeps working after your push token rotates (the clone
deliberately stores no token). The directory defaults to the current one.

--ff-only is deliberate: a Vibe git project cloned locally is normally a mirror
you build from, so a refusal telling you the branch diverged is a better
outcome than a merge commit created behind your back. Resolve a divergence
yourself, then re-run.

Examples:
  $ nexus vibe git-project pull 11111111-2222-4333-8444-555555555555
  $ nexus vibe git-project pull 11111111-2222-4333-8444-555555555555 ./shared-lib
`
    )
    .action(async (projectId: string, directory: string | undefined) => {
      try {
        assertGitAvailable();
        const target = directory?.trim() ? directory.trim() : ".";
        assertGitRepository(target);

        const opts = resolveTenantOpts(program);
        const credentialData = await tenantRequest<GetGitCredentialsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/git-credentials"
        });

        runGitWithCredential(credentialData.credentials, "pull", (credentialPath) =>
          buildPullArgs(credentialPath, target)
        );

        if (isJsonMode()) {
          console.log(JSON.stringify({ gitProjectId: projectId, directory: target }, null, 2));
          return;
        }
        console.log(`${color.green("✓")} Pulled ${target} (fast-forward only)`);
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
Notes:
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
        printVibeGitProject(data.gitProject, { freshlyProvisioned: true });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  confirmable(project.command("delete <projectId>"))
    .description("Delete a git project and release its name")
    .addHelpText(
      "after",
      `
Notes:
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
          { ...cmdOpts, rerun: `nexus vibe git-project delete ${projectId} --yes` }
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
      `Filter to a single event type. ${VIBE_AUDIT_EVENT_TYPES.length} values — listed under "Event types" below.`
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
  $ nexus vibe audit list --type DEPLOYMENT_ROLLED_BACK_HEALTH_CHECK --app <appId>
  $ nexus vibe audit list --cursor "2026-05-25T12:00:00.000Z|abc…"
  $ nexus vibe audit list --json | jq '.events[]'

Event types (--type takes exactly one):
${formatEventTypeHelp()}
  A deploy watcher polls the terminal states: DEPLOYMENT_SERVED (live and
  serving), DEPLOYMENT_HEALTHY (allocation healthy, edge not yet swapped),
  DEPLOYMENT_FAILED, DEPLOYMENT_ROLLED_BACK_HEALTH_CHECK, BUILD_JOB_FAILED.
  This list is generated from the schema, so it never lags the feed.

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

Notes:
  TWO MORE FAMILIES ARE WORTH A FILTER, AND NEITHER IS A DEPLOY EVENT.
  COST_SAFETY_AUTO_SUSPENDED IS NOT A WARNING. A sweep then flips EVERY
  non-terminal deployment in that org to ROLLED_BACK, one
  DEPLOYMENT_ROLLED_BACK_COST_SAFETY row per app — so the org stops serving
  shortly after this event, with no failing build and nothing in the deploy
  family to explain it. COST_SAFETY_SOFT_LIMIT_WARNING is the one that only
  warns.
  DEPLOYMENT_VERIFICATION_OVERRIDDEN IS THE ONLY RECORD THAT A SHIP GATE WAS
  BYPASSED. "vibe deploy --skip-verification" names the caller and the commit
  here and nowhere else. Its neighbours: DEPLOYMENT_VERIFICATION_REFUSED (the
  gate stopped the deploy) and DEPLOYMENT_VERIFICATION_WARNED (the app sits in
  WARN, so the gate ran, recorded, and shipped anyway).
`
    )
    .action(async (cmdOpts: { app?: string; type?: string; limit?: string; cursor?: string }) => {
      try {
        const limit = parseLimit(cmdOpts.limit);
        if (cmdOpts.type !== undefined && !isAuditEventType(cmdOpts.type)) {
          // The full list, not a pointer to --help. The whole defect this
          // guard once carried was an operator being told a real event type
          // did not exist; a refusal that does not name the alternatives
          // reproduces the same dead end one step later.
          throw new Error(
            `Invalid --type "${cmdOpts.type}". Allowed values:\n${formatEventTypeHelp()}`
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
    profile: globals.profile as string | undefined,
    timeout: timeoutSecondsToMs(globals.timeout as number | undefined)
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

  printTable(rows, [
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
  printRecord(tool, [
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
export function buildAppUpdateBody(cmdOpts: {
  deployBranch?: string;
  description?: string;
  requireApprovals?: string;
  shipGate?: string;
  requireVerification?: string;
  resourceQuotas?: string;
  healthCheck?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (cmdOpts.deployBranch !== undefined) body.deployBranch = cmdOpts.deployBranch;
  if (cmdOpts.description !== undefined) body.description = cmdOpts.description;
  if (cmdOpts.requireApprovals !== undefined) {
    body.requireApprovals = parseBoolFlag(cmdOpts.requireApprovals, "--require-approvals");
  }
  // Refused HERE rather than sent for the server to resolve. The API's rule is
  // that `shipGateMode` wins, which is right for a client sending a new field
  // beside an old one it still populates — but a person typed these two flags,
  // and honouring one while dropping the other leaves the gate in a state they
  // did not choose, with a success message on top.
  if (cmdOpts.shipGate !== undefined && cmdOpts.requireVerification !== undefined) {
    throw new Error(
      "--ship-gate and --require-verification both set the same field and contradict each other. Pass --ship-gate alone (off, warn or enforce); --require-verification cannot reach warn."
    );
  }
  if (cmdOpts.shipGate !== undefined) {
    body.shipGateMode = parseShipGateFlag(cmdOpts.shipGate);
  }
  if (cmdOpts.requireVerification !== undefined) {
    body.requireVerification = parseBoolFlag(cmdOpts.requireVerification, "--require-verification");
  }
  if (cmdOpts.resourceQuotas !== undefined) {
    body.resourceQuotas = parseJsonFlag(cmdOpts.resourceQuotas, "--resource-quotas");
  }
  if (cmdOpts.healthCheck !== undefined) {
    body.healthCheckConfig = parseJsonFlag(cmdOpts.healthCheck, "--health-check");
  }
  if (Object.keys(body).length === 0) {
    throw new Error(
      "Nothing to update. Pass at least one of --deploy-branch, --description, --require-approvals, --ship-gate, --require-verification, --resource-quotas, --health-check."
    );
  }
  return body;
}

/**
 * `off` / `warn` / `enforce` -> the wire's `OFF` / `WARN` / `ENFORCE`.
 *
 * REFUSES anything else rather than coercing, which is the rule `parseBoolFlag`
 * below already keeps for this file's booleans: a value quietly read as `OFF`
 * would switch a gate off and print a success line. Case and surrounding
 * whitespace are forgiven — a shell that hands over `Warn ` has not expressed a
 * different intention — and nothing else is.
 */
function parseShipGateFlag(raw: string): VibeShipGateMode {
  const normalised = raw.trim().toUpperCase();
  if (normalised === "OFF" || normalised === "WARN" || normalised === "ENFORCE") {
    return normalised;
  }
  throw new Error(
    `Invalid --ship-gate "${raw}". Expected "off", "warn" or "enforce". warn checks the artifacts and ships the deploy anyway; enforce refuses it.`
  );
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

  // THE PREAMBLE GOES WHERE THE QUESTION GOES. These three lines are the
  // figures the y/N refers to; on `console.log` with stdout redirected the
  // operator is asked to accept a spend and shown none of it.
  promptLine(color.yellow("Spend confirmation required — nothing was deployed."));
  promptLine(`  Cost-safety status: ${data.reason.costSafetyStatus}`);
  promptLine(`  ${data.reason.message}`);

  // STDIN, because that is the stream the answer arrives on. Testing stdout
  // refused a `vibe deploy > log` typed at an operator's own keyboard.
  if (!process.stdin.isTTY) {
    console.error(`\nRe-run confirmed:\n  ${rerun}`);
    return false;
  }

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: promptStream() });
  const answer = await rl.question("Deploy anyway and accept the additional spend? [y/N] ");
  rl.close();
  if (answer.toLowerCase() !== "y") {
    promptLine("Aborted.");
    promptLine(color.dim(`Re-run confirmed:\n  ${rerun}`));
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
  forceRebuild = false,
  skipVerification = false
): Promise<Extract<TriggerDeploymentResponse, { status: "created" | "reused" }> | null> {
  const send = async (confirmOverage: boolean): Promise<TriggerDeploymentResponse> =>
    tenantRequest<TriggerDeploymentResponse>(opts, {
      method: "POST",
      path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments`,
      // `forceRebuild` and `skipVerification` ride EVERY send, including the
      // post-confirmation one: the re-send is the SAME request answered, so
      // dropping either there would silently change what the operator asked
      // for — a reused image they wanted replaced, or a deploy refused by a
      // gate they had already chosen to pass.
      body: { triggerSha, confirmOverage, forceRebuild, skipVerification }
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
  printRecord(d, [
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

  printTable(rows, [
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
  printRecord(d, [
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
  printRecord(b, [
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
    // Compact on purpose — a table cell, where `app get` has room for the fix.
    // It earns its column by separating the two apps that render identically in
    // every other one: the app nobody has pushed to, and the app that has no
    // source to push to.
    source: formatDeployabilityCell(a.deployability),
    approvals: a.requireApprovals ? color.yellow("required") : color.dim("off"),
    publicUrl: a.publicUrl ?? color.dim("—"),
    createdAt: formatTimestamp(a.createdAt)
  }));

  printTable(rows, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "deployBranch", label: "Deploy" },
    { key: "source", label: "Source" },
    { key: "approvals", label: "Approvals" },
    { key: "publicUrl", label: "URL" },
    { key: "createdAt", label: "Created" }
  ]);
}

/**
 * The table-cell rendering of {@link formatDeployability} — same three states,
 * no remedy text. A cell cannot carry the fix, so `app get` does.
 *
 * `DEPLOYABLE` is dim and the two failures are coloured: in a fleet listing,
 * the working rows are the background and the broken ones are what the eye
 * should catch.
 */
export function formatDeployabilityCell(deployability: VibeAppDeployability): string {
  if (deployability === "DEPLOYABLE") return color.dim("ready");
  if (deployability === "NO_SOURCE_ATTACHED") return color.red("no source");
  if (deployability === "SOURCE_NOT_READY") return color.yellow("not ready");
  // Absent, not unknown — see `formatDeployability`. A dash is the table's
  // existing vocabulary for "this server did not say".
  return color.dim("—");
}

/**
 * One line saying whether this app can deploy at all, and what to do when it
 * cannot.
 *
 * `NO_SOURCE_ATTACHED` is red rather than dim because it is the state that used
 * to be invisible: an app with no git project renders `Edge: not checked yet`
 * and `Public URL: …` exactly like a wired app nobody has pushed to, so an
 * operator asking "why does my URL do nothing" got no answer from this command
 * at all. The two failing values name DIFFERENT fixes — attach a project, or
 * wait for / repair the one already attached — which is the whole reason the
 * enum has three values instead of a boolean.
 */
export function formatDeployability(
  deployability: VibeAppDeployability,
  gitProject: VibeAppGitProjectSummaryDto | null
): string {
  if (deployability === "DEPLOYABLE") {
    return color.green("deployable") + color.dim(" — a push to the deploy branch builds");
  }
  if (deployability === "NO_SOURCE_ATTACHED") {
    return (
      color.red("no source attached") +
      color.dim(" — nothing to build; attach one with `vibe app attach-repo`")
    );
  }
  if (deployability === "SOURCE_NOT_READY") {
    return (
      color.yellow("source not ready") +
      color.dim(
        gitProject === null || gitProject === undefined
          ? " — the attached git project is not READY"
          : ` — git project "${gitProject.name}" is ${gitProject.status}`
      )
    );
  }
  // An if-chain with a fallback rather than an exhaustive switch, and the
  // reason is version skew, not style: this CLI ships standalone to npm and is
  // routinely pointed at a backend older than itself. `deployability` is a
  // recent field, so it can be genuinely absent on the wire, and a switch the
  // compiler believes is exhaustive would return `undefined` and print it. The
  // same reflex is already visible three times in this file as
  // `data.gitProject ?? data.repository`, and once next door as
  // `edgeReachability`'s "last check was inconclusive".
  return color.dim("not reported by this server");
}

/**
 * The `Ship gate` line, one per mode.
 *
 * A `Record` KEYED BY THE UNION, never an if-chain: the field has three states
 * and the row used to render a boolean projection of it, so `WARN` — the state
 * the boolean cannot express — printed as `off` on an app whose every deploy was
 * recording a finding. An if-chain over an enum makes a fourth state fall
 * through to whatever the last branch is, which is the same defect with a new
 * value in it. A missing entry here is a compile error.
 *
 * Each label says what the gate DOES, not what it is called. "off" alone was
 * ambiguous in the other direction too — it says nothing about the repository's
 * artifacts, which may well be green.
 */
const SHIP_GATE_MODE_LINES: Record<VibeShipGateMode, string> = {
  OFF: "off",
  WARN: color.yellow("warn") + color.dim(" — artifacts are checked and a finding does not block"),
  ENFORCE: "enforce" + color.dim(" — artifacts must be green or the deploy is refused")
};

/**
 * Render a ship-gate mode, including the two cases the union cannot describe.
 *
 * ⚠️ THE `Record` ABOVE IS A COMPILE-TIME GUARANTEE AND THIS BINARY OUTLIVES IT.
 * The CLI ships standalone to npm and is routinely pointed at a backend NEWER
 * than itself, so a mode added upstream arrives at an installed binary whose
 * union has never heard of it. It is echoed rather than mapped — an unrecognised
 * mode printed as one of the three known ones is exactly the lie this function
 * exists to end. Same reflex as `formatDeployability`'s fallback next door,
 * except that one gives up the compile-time check to get the runtime one; the
 * lookup here keeps both.
 *
 * `undefined` is the OPPOSITE skew — a backend one release BEHIND omits the key
 * — and it is never `off`. The gate may be running; this server did not say.
 */
export function formatShipGateMode(mode: VibeShipGateMode | undefined): string {
  if (mode === undefined) return color.dim("not reported by this server");
  if (!Object.prototype.hasOwnProperty.call(SHIP_GATE_MODE_LINES, mode)) {
    return color.yellow(String(mode)) + color.dim(" — a mode this CLI version does not know");
  }
  return SHIP_GATE_MODE_LINES[mode];
}

export function printVibeApp(app: VibeAppDto, extras?: VibeAppEnvelopeExtras): void {
  if (isJsonMode()) {
    // Merged rather than nested: this command has always printed the app at the
    // top level, so `{ ...app }` keeps every existing key exactly where a script
    // already reads it and the joins arrive as purely additive siblings.
    console.log(JSON.stringify({ ...app, ...extras }, null, 2));
    return;
  }

  const q = app.resourceQuotas;
  const row = { ...app, ...extras };
  // Only when the envelope actually carried them. CREATE and UPDATE answer
  // with a bare `{ app }`, and printing "Source: —" there would assert the app
  // has no git project when the read simply never asked.
  //
  // Hoisted so the conditional gets a contextual type. Spread inline, the
  // best-common-type of `[]` and the literal widens `key` to `string`, which
  // silently takes EVERY field below out of the key check too.
  const envelopeFields: RecordField<typeof row>[] =
    extras === undefined
      ? []
      : [
          {
            key: "gitProject",
            label: "Source",
            format: () =>
              extras.gitProject === null
                ? color.dim("none")
                : `${extras.gitProject.name} (${extras.gitProject.status})`
          },
          {
            key: "deployability",
            label: "Deployability",
            format: () => formatDeployability(extras.deployability, extras.gitProject)
          }
        ];
  printRecord(row, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "deployBranch", label: "Deploy branch" },
    ...envelopeFields,
    {
      key: "requireApprovals",
      label: "Approvals",
      format: (v) => (v === true ? "required" : "off")
    },
    {
      // `shipGateMode`, NEVER the `requireVerification` boolean beside it. That
      // boolean is the server's compatibility projection of this same field and
      // it is lossy in one direction: `WARN` projects to `false`, so this row
      // printed `off` on an app that was reading its repository on every deploy
      // and writing DEPLOYMENT_VERIFICATION_WARNED. The table and the audit feed
      // disagreed and nothing said which was right.
      key: "shipGateMode",
      label: "Ship gate",
      // Read off `app` rather than the untyped `val` the printer hands in, so
      // the union — and the absent case — reach `formatShipGateMode` typed.
      format: () => formatShipGateMode(app.shipGateMode)
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

/**
 * One row of the merged environment table, whatever backs it.
 *
 * The table is merged rather than stacked because the app does not see two
 * lists: it sees ONE environment, and a name is held by exactly one entry. Two
 * sections would show a collision as two unrelated rows.
 */
interface EnvTableRow {
  id: string;
  name: string;
  value: string;
  source: string;
  card: string;
  scope: VibeEnvVarScope;
  status: string;
  updatedAt: string;
}

/**
 * The status cell for a card-backed row, with the owner's remaining daily
 * quota folded in when there is a cap.
 *
 * An if-chain with a fallback rather than an exhaustive switch, for the same
 * version-skew reason spelled out on {@link formatDeployability}: this CLI
 * ships standalone to npm and is routinely pointed at a backend NEWER than
 * itself, which may name a state this build has never heard of. A switch the
 * compiler believes is exhaustive would return `undefined` and print it — and
 * an unknown state must never read as a working one.
 */
function formatCardStatus(binding: VibeAppCardBindingDto): string {
  const quota =
    binding.quotaPerDay === null || binding.quotaRemaining === null
      ? ""
      : ` (${binding.quotaRemaining}/${binding.quotaPerDay})`;

  // The quota rides on `active` alone. On a paused or revoked card the
  // remaining allowance is not a budget anyone can spend, and printing it
  // beside "revoked" reads as though the card were still usable.
  if (binding.status === "ACTIVE") return color.green("active") + quota;
  if (binding.status === "PENDING_APPROVAL") return color.yellow("pending approval");
  if (binding.status === "PAUSED") return color.yellow("paused");
  if (binding.status === "REVOKED") return color.red("revoked");
  if (binding.status === "EXPIRED") return color.red("expired");
  return color.yellow("state this CLI does not understand");
}

/**
 * The source cell for a card-backed row. The projection is named only when it
 * is NOT `HANDLE`, because `HANDLE` is what the value column already shows: an
 * address the app resolves through the broker. Any other projection puts
 * something else in the variable, and the reader has to be told which.
 */
function formatCardSource(binding: VibeAppCardBindingDto): string {
  return binding.projection === "HANDLE"
    ? "card"
    : `card (${binding.projection.toLowerCase().replace(/_/g, " ")})`;
}

function toEnvVarRow(envVar: VibeAppEnvVarDto): EnvTableRow {
  return {
    // Full id, not shortenId: `env rm` takes the id and `env list` is the
    // only way to discover it, so the displayed id must be copy-pasteable.
    id: envVar.id,
    name: envVar.name,
    // Collapse newlines + truncate so a multiline or huge value never
    // breaks the table. Full value is available via --json.
    value: truncate(envVar.value.replace(/\s+/g, " "), 48),
    source: "variable",
    card: "—",
    scope: envVar.scope,
    status: "—",
    updatedAt: formatTimestamp(envVar.updatedAt)
  };
}

function toCardBindingRow(binding: VibeAppCardBindingDto): EnvTableRow {
  return {
    id: binding.id,
    name: binding.name,
    // The handle in full, never truncated: it is the literal value the app
    // reads, and it is not a secret — see VibeAppCardBindingDto.handle.
    value: binding.handle,
    source: formatCardSource(binding),
    // Whose authority, then which attenuation of it. The credential first
    // because that is what the card's owner recognises as theirs.
    card: truncate(`${binding.credentialName} — ${binding.accessCardName}`, 36),
    scope: binding.scope,
    status: formatCardStatus(binding),
    updatedAt: formatTimestamp(binding.updatedAt)
  };
}

/**
 * Declaration order of {@link VIBE_ENV_VAR_SCOPES} — ALL, then PROD, then
 * STAGING, which is the order the deployer resolves in: ALL first, then the
 * environment-specific scope overwriting by name.
 *
 * A scope this build has never heard of yields -1 and sorts to the TOP, which
 * is the right direction for the same version-skew reason as the formatters
 * above: an unrecognised row must be conspicuous, never buried.
 */
function scopeRank(scope: VibeEnvVarScope): number {
  return VIBE_ENV_VAR_SCOPES.indexOf(scope);
}

function printEnvVarList(data: ListEnvVarsResponse): void {
  if (isJsonMode()) {
    // The wire envelope through unchanged: `.envVars[]` stays exactly where
    // every existing jq consumer already reads it, and `.cardBindings[]`
    // arrives as a purely additive sibling.
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // `?? []` collapses "this server predates cards" into "this app has none"
  // for RENDERING only. The distinction is preserved on the wire and in
  // --json; here both correctly produce a table with no card rows.
  const bindings = data.cardBindings ?? [];

  if (data.envVars.length === 0 && bindings.length === 0) {
    console.log(color.dim("Nothing set in this app's environment."));
    return;
  }

  // Sorted here rather than trusted from the wire: the two kinds arrive as two
  // arrays, each ordered within itself, so a merged order only exists if this
  // side makes one. Scope then name is the order the deployer resolves in.
  const rows = [...data.envVars.map(toEnvVarRow), ...bindings.map(toCardBindingRow)].sort(
    (a, b) => scopeRank(a.scope) - scopeRank(b.scope) || a.name.localeCompare(b.name)
  );

  printTable(rows, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "value", label: "Value" },
    { key: "source", label: "Source" },
    { key: "card", label: "Card" },
    { key: "scope", label: "Scope" },
    { key: "status", label: "Status" },
    { key: "updatedAt", label: "Updated" }
  ]);
}

function printEnvVar(envVar: VibeAppEnvVarDto): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(envVar, null, 2));
    return;
  }

  printRecord(envVar, [
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

  printRecord(edgeToken, [
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

  printTable(rows, [
    { key: "deploymentId", label: "Deployment" },
    { key: "status", label: "Status" },
    { key: "requiredApprovals", label: "Required" },
    { key: "expiresAt", label: "Expires" },
    { key: "createdAt", label: "Created" }
  ]);
}

function printApprovalRequest(request: VibeApprovalRequestDto): void {
  printRecord(request, [
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
  printTable(rows, [
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

/**
 * The seeded-repo first-push warning, and the two commands that work.
 *
 * A tenant repo is materialized with `auto_init`, so it already carries a commit
 * before the operator has pushed anything. Their first push from a local repo
 * they started themselves is a non-fast-forward, and git refuses it with a bare
 * `fetch first` that names no cause: the operator's repo is missing a commit
 * they never made and were never told about.
 *
 * This MUST be said before the push, because nothing can say it during one. A
 * non-fast-forward is rejected CLIENT-SIDE — the pusher's own git compares the
 * advertised ref against local history and aborts without sending a single
 * packet, so no server-side hook runs. Not `post-receive`, and not a
 * `pre-receive` hook either: the git host is never told a push was attempted,
 * and therefore has nothing to annotate. Provisioning is the last moment at
 * which the platform can speak at all, which is why the sentence lives here
 * rather than in a hook.
 */
export function formatSeededRepoFirstPushHint(project: {
  id: string;
  defaultBranch?: string;
}): string {
  return [
    color.yellow("This project's repo is created with an initial commit already on it."),
    `A first push from a local repo you started yourself is rejected with "fetch first".`,
    "Start from the repo, or replay local work you already have onto it:",
    `  nexus vibe git-project clone ${project.id}`,
    // `defaultBranch` is optional on the deprecated `repository` alias, which is
    // the only value a pre-decoupling backend sends. Interpolating it blind
    // printed `git rebase origin/undefined` — a command that cannot work,
    // rendered as one that can.
    project.defaultBranch === undefined
      ? `  git fetch origin && git rebase origin/<the project's default branch>`
      : `  git fetch origin && git rebase origin/${project.defaultBranch}`
  ].join("\n");
}

/**
 * `freshlyProvisioned` marks the commands that MINT or re-materialize the repo —
 * the ones after which a first push is imminent. `attach-repo` and `get` pass it
 * false: those speak about a project that already holds the operator's code, so
 * the seeded-repo warning would be noise at best and wrong at worst.
 */
/**
 * Takes the ALIAS shape, not the full project, so both callers type-check: the
 * app-scoped reads fall back to `data.repository`, whose `name`, `description` and
 * `defaultBranch` are optional on the wire. A full `VibeGitProjectDto` is assignable
 * to it, so the standalone routes are unaffected.
 *
 * An absent field renders as "not sent by this backend" rather than as a blank line —
 * `printRecord` stringifies `undefined` to `""`, which reads as an empty value the
 * server chose rather than a key it never sent.
 */
function printVibeGitProject(
  project: VibeGitProjectAliasDto,
  opts: { freshlyProvisioned?: boolean } = {}
): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(project, null, 2));
    return;
  }

  const orAbsent = (v: unknown): string =>
    v === undefined ? color.dim("— not sent by this backend") : String(v);

  printRecord(project, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name", format: orAbsent },
    { key: "defaultBranch", label: "Default branch", format: orAbsent },
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
  if (opts.freshlyProvisioned === true) {
    console.log("");
    console.log(formatSeededRepoFirstPushHint(project));
  }
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

  printTable(rows, [
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

/**
 * The event types, two per line, indented to sit under a help heading.
 *
 * Shared by `--help` and the `--type` refusal so the two cannot disagree
 * about what is accepted — the disagreement being the defect: `--help`
 * documented 6 values while the feed emitted types it did not list.
 */
function formatEventTypeHelp(): string {
  const width = Math.max(...VIBE_AUDIT_EVENT_TYPES.map((t) => t.length));
  const lines: string[] = [];
  for (let i = 0; i < VIBE_AUDIT_EVENT_TYPES.length; i += 2) {
    const pair = VIBE_AUDIT_EVENT_TYPES.slice(i, i + 2);
    lines.push(`  ${pair.map((t) => t.padEnd(width)).join("  ")}`.trimEnd());
  }
  return lines.join("\n");
}

/** How an event reads at a glance, driving only its colour in the table. */
type AuditEventTone = "failure" | "warning" | "success" | "neutral";

/**
 * Every event type's tone. A `Record` rather than an if/else chain on
 * purpose: adding a member to the Prisma enum regenerates
 * `VIBE_AUDIT_EVENT_TYPES`, and this map then fails to typecheck until
 * somebody classifies the new event.
 *
 * That is the same discipline the `--type` list now has, applied to the
 * other half of the surface. A fallthrough default would have let a new
 * failure event print in the same neutral grey as a routine one — legible,
 * plausible, and wrong in the direction that hides an incident.
 */
const AUDIT_EVENT_TONE: Record<VibeAuditEventType, AuditEventTone> = {
  DEPLOYMENT_TRIGGERED: "neutral",
  DEPLOYMENT_APPROVED: "success",
  DEPLOYMENT_REJECTED: "warning",
  APPROVAL_EXPIRED: "warning",
  COST_SAFETY_AUTO_SUSPENDED: "failure",
  COST_SAFETY_SOFT_LIMIT_WARNING: "warning",
  COST_SAFETY_MANUALLY_SUSPENDED: "failure",
  COST_SAFETY_MANUALLY_WARNED: "warning",
  COST_SAFETY_MANUALLY_RESUMED: "success",
  COST_SAFETY_SOFT_LIMIT_CLEARED: "success",
  DEPLOYMENT_ROLLED_BACK_COST_SAFETY: "failure",
  BUILD_JOB_SUCCEEDED: "success",
  DEPLOYMENT_BUILD_SUCCEEDED: "success",
  BUILD_JOB_FAILED: "failure",
  DEPLOYMENT_FAILED: "failure",
  BUILD_JOB_TIMED_OUT: "failure",
  DEPLOYMENT_HEALTHY: "success",
  DEPLOYMENT_ROLLED_BACK_HEALTH_CHECK: "failure",
  DEPLOYMENT_SUPERSEDED: "neutral",
  DEPLOYMENT_DISPLACED: "neutral",
  DEPLOYMENT_ROLLED_BACK_USER: "warning",
  // Failure, where the USER rollback above is only a warning. That one is a
  // person deciding to go back; this one is a version that was serving real
  // traffic and started crashing. Same word in the name, opposite urgency.
  DEPLOYMENT_ROLLED_BACK_CRASH_LOOP: "failure",
  // Failure for the same reason as the crash loop above: a version that was
  // serving real traffic was pulled back out of it. The cause differs — the app
  // answered, it just answered wrongly — but what an operator has to do about it
  // does not.
  DEPLOYMENT_ROLLED_BACK_FAILED_SMOKE: "failure",
  SECRET_VALUE_STAGED: "neutral",
  SECRET_VALUE_WRITTEN: "neutral",
  CAPACITY_REQUESTED: "neutral",
  CAPACITY_APPROVED: "success",
  CAPACITY_REJECTED: "warning",
  CAPACITY_EXPIRED: "warning",
  CAPACITY_GROWN: "success",
  APP_EDGE_UNROUTED: "failure",
  GIT_PUSH_NO_DEPLOY: "neutral",
  DEPLOYMENT_SERVED: "success",
  DEPLOYMENT_VERIFICATION_REFUSED: "failure",
  DEPLOYMENT_VERIFICATION_OVERRIDDEN: "warning",
  DEPLOYMENT_VERIFICATION_WARNED: "warning",
  // The access-card lifecycle. Delegating a credential is WARNING, not success:
  // it is a correct, routine action and it is also the row an owner scanning
  // "what can act as me?" has to find, which green would hide. Revoking is the
  // good outcome on this surface, so it takes the green — it answers "did
  // anyone actually take this back?". A pause is neutral because it is
  // reversible and routinely automatic; red would put a nightly quota trip in
  // the same colour as a revocation.
  CARD_GRANT_ISSUED: "warning",
  CARD_GRANT_PAUSED: "neutral",
  CARD_GRANT_ACTIVATED: "neutral",
  CARD_GRANT_REVOKED: "success",
  CARD_BINDING_RENAMED: "neutral",
  CARD_BINDING_REMOVED: "neutral"
};

function colorizeEventType(t: VibeAuditEventType): string {
  switch (AUDIT_EVENT_TONE[t]) {
    case "failure":
      return color.red(t);
    case "warning":
      return color.yellow(t);
    case "success":
      return color.green(t);
    case "neutral":
      return t;
  }
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
 * Every other event type falls to `formatUnmodelledDetails`, which renders
 * the fields it recognises generically. The `default` arm is what makes the
 * column honest: the feed emits 34 types and this file names 7, so before it
 * existed a DEPLOYMENT_FAILED row printed the literal string `undefined`
 * where its reason belonged.
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
const UNMODELLED_DETAIL_FIELDS = [
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
 * details column is where a reader scanning `vibe audit list` decides whether
 * a row matters, and a blank one on DEPLOYMENT_FAILED reads as "no further
 * information exists" rather than "this printer has no case for it".
 */
function formatUnmodelledDetails(payload: AuditPayloadUnmodelled): string {
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

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
