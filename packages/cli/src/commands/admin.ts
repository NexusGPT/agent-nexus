/**
 * `nexus admin …` — platform-operator commands.
 *
 * Distinct from the rest of the CLI in two ways:
 *
 *   1. Auth. Admin endpoints are guarded by `AdminPermissionGuard` (PBAC),
 *      which reads identity off the Clerk JWT — not the org API key. Pass a
 *      JWT via `--admin-token` or `NEXUS_ADMIN_TOKEN`. The token isn't
 *      persisted to disk; sessions are short-lived.
 *
 *   2. Path prefix. Admin routes live at `/api/admin/...`, bypassing the
 *      SDK's `/api/public/v1` prefix. See `util/admin-http.ts`.
 *
 * v1 scope: Vibe cost-safety + Vibe consumption-cap inspect/edit, plus a
 * trigger for the cost-safety rollback sweep. No admin-panel UI exists for
 * Vibe (`06-open-questions §8`); this CLI is the operator's only surface.
 */

import { Command } from "commander";

import { color, printRecord } from "../output";
import { AdminCliError, handleAdminError } from "../util/admin-errors";
import { type AdminHttpOptions, adminRequest } from "../util/admin-http";

// ============================================================
// Shared response types — mirror the backend's ZAdminVibe* schemas.
//
// We don't pull types from `@nexus/types` because the CLI is published as
// a standalone npm package; the backend types package isn't a runtime dep.
// Schemas live in `packages/types/src/api/domains/admin/zadmin-vibe-*.ts`
// — keep these shapes in lockstep when the backend evolves.
// ============================================================

interface VibeOrgCostSafetyStateResponse {
  organizationId: string;
  status: "OK" | "WARNING" | "SUSPENDED";
  suspendedReason: string | null;
  present: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

interface VibeOrgConsumptionCapResponse {
  organizationId: string;
  /** Raw overrides — null = use platform default for this type. */
  computeMinCap: number | null;
  buildMinCap: number | null;
  egressMbCap: number | null;
  /** Resolved effective caps (override ?? platform default). */
  effectiveComputeMinCap: number;
  effectiveBuildMinCap: number;
  effectiveEgressMbCap: number;
  present: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Tri-state PATCH value for a consumption-cap column. Distinguishes the
 * three semantically-different operator intents:
 *
 *   - flag omitted          → property absent from body → adapter leaves column untouched
 *   - flag value `"none"`   → property present, value `null` → adapter clears the override
 *   - flag value integer    → property present, value number → adapter installs the override
 *
 * The whole reason this is wire-level visible (rather than just `number | null`
 * with `null = unchanged`) is that "do nothing" and "clear" both need
 * non-collapsing representations across the JSON boundary. See the backend's
 * SetVibeOrgConsumptionCapUseCase which uses `in` (not `??`) to keep them
 * distinct.
 */
type CapPatchValue = number | null;

// ============================================================
// Root admin command
// ============================================================

export function registerAdminCommands(program: Command): void {
  const admin = program
    .command("admin")
    .description("Platform-operator commands (admin token required)")
    .addHelpText(
      "after",
      `
Authentication:
  Admin endpoints require a Clerk JWT, not an org API key. Set
  NEXUS_ADMIN_TOKEN or pass --admin-token <jwt> on the subcommand.
  Grab the JWT from gpt.nexus DevTools → Network → any request →
  Authorization header (the "Bearer eyJ..." value).

Subcommands:
  vibe-cost-safety     Read/write per-org Vibe cost-safety state
  vibe-consumption-cap Read/write per-org Vibe consumption-cap overrides
  vibe-tenant-cluster  Provision / disable an org's dedicated data-plane cluster
  vibe-rollback-sweep  Manually trigger the cost-safety rollback sweep
  vibe-build-job-timeout-sweep  Manually trigger the build-job timeout sweep
  vibe-build-runner    Fire one tick of the Vibe build-runner pipeline
  vibe-deployment-runner Fire one tick of the Vibe deployer pipeline

Exit codes:
  0  success
  1  network or malformed response
  2  missing / invalid admin token (HTTP 401)
  3  permission denied (HTTP 403)
  4  not found (HTTP 404)
  5  invalid state / validation (HTTP 400/422)
  6  server error (HTTP 5xx)
`
    );

  // Global admin-only options. Inherited by every subcommand via opts merging.
  admin.option(
    "--admin-token <jwt>",
    "Clerk admin JWT (overrides NEXUS_ADMIN_TOKEN). Strip the 'Bearer ' prefix or leave it — both work."
  );

  registerVibeCostSafetyCommands(admin, program);
  registerVibeConsumptionCapCommands(admin, program);
  registerVibeTenantClusterCommands(admin, program);
  registerVibeBuildJobCommands(admin, program);
  registerVibeDeploymentCommands(admin, program);
  registerVibeRollbackSweepCommands(admin, program);
  registerVibeBuildJobTimeoutSweepCommands(admin, program);
  registerVibeBuildRunnerCommands(admin, program);
  registerVibeDeploymentRunnerCommands(admin, program);
}

// ============================================================
// vibe-cost-safety
// ============================================================

const COST_SAFETY_STATUS_VALUES = ["OK", "WARNING", "SUSPENDED"] as const;
type CostSafetyStatus = (typeof COST_SAFETY_STATUS_VALUES)[number];

function isCostSafetyStatus(v: string): v is CostSafetyStatus {
  return (COST_SAFETY_STATUS_VALUES as readonly string[]).includes(v);
}

function registerVibeCostSafetyCommands(admin: Command, program: Command): void {
  const cs = admin
    .command("vibe-cost-safety")
    .description("Inspect / flip the per-org Vibe cost-safety state");

  cs.command("get")
    .description("Read one org's cost-safety state (defaults to OK when no row exists)")
    .argument("<organizationId>", "Target organization id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-cost-safety get org_abc123
  $ nexus admin vibe-cost-safety get org_abc123 --json

Output fields:
  status            OK | WARNING | SUSPENDED. SUSPENDED refuses new deploys.
  suspendedReason   Carried verbatim into the refuse-deploy HTTP message.
  present           false = no row exists (treated as OK at the deploy gate).
                    true  = a row exists, even if it's been explicitly set back to OK.
`
    )
    .action(async (organizationId: string) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeOrgCostSafetyStateResponse>(opts, {
          method: "GET",
          path: `/api/admin/vibe/cost-safety/${encodeURIComponent(organizationId)}`
        });
        printCostSafetyRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  cs.command("set")
    .description("Flip one org's cost-safety state (operator escape hatch)")
    .argument("<organizationId>", "Target organization id")
    .requiredOption("--status <status>", "OK | WARNING | SUSPENDED")
    .option(
      "--reason <text>",
      "Required when --status SUSPENDED. 1-500 chars. Carried verbatim into the refuse-deploy HTTP message for the gated org."
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-cost-safety set org_abc --status SUSPENDED --reason "fraud investigation"
  $ nexus admin vibe-cost-safety set org_abc --status OK
  $ nexus admin vibe-cost-safety set org_abc --status WARNING

Notes:
  --reason is required when --status SUSPENDED (refused locally before the
  HTTP call, mirroring the backend's 422). For non-SUSPENDED statuses any
  reason passed is dropped — the use case normalizes the column to null
  so flipping back to OK never carries a stale rationale forward.
`
    )
    .action(async (organizationId: string, cmdOpts: { status: string; reason?: string }) => {
      try {
        const status = cmdOpts.status.toUpperCase();
        if (!isCostSafetyStatus(status)) {
          throw AdminCliError.localValidation(
            `Invalid --status "${cmdOpts.status}". Allowed: ${COST_SAFETY_STATUS_VALUES.join(", ")}.`
          );
        }
        const trimmedReason = cmdOpts.reason?.trim();
        if (status === "SUSPENDED" && !trimmedReason) {
          throw AdminCliError.localValidation(
            "--reason is required (non-empty) when --status SUSPENDED."
          );
        }

        // Body only carries the reason when SUSPENDED. The backend normalizes
        // non-SUSPENDED requests to null anyway, but sending a stale reason
        // would still surface in the audit trail's request payload — keep it
        // out so the audit row only carries the rationale that the gate
        // actually uses.
        const body: { status: CostSafetyStatus; suspendedReason?: string } = { status };
        if (status === "SUSPENDED" && trimmedReason) {
          body.suspendedReason = trimmedReason;
        }

        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeOrgCostSafetyStateResponse>(opts, {
          method: "PATCH",
          path: `/api/admin/vibe/cost-safety/${encodeURIComponent(organizationId)}`,
          body
        });
        printCostSafetyRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

// ============================================================
// vibe-consumption-cap
// ============================================================

function registerVibeConsumptionCapCommands(admin: Command, program: Command): void {
  const cap = admin
    .command("vibe-consumption-cap")
    .description("Inspect / override the per-org Vibe consumption caps");

  cap
    .command("get")
    .description("Read one org's consumption-cap overrides + resolved effective caps")
    .argument("<organizationId>", "Target organization id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-consumption-cap get org_abc123
  $ nexus admin vibe-consumption-cap get org_abc123 --json

Output fields:
  computeMinCap / buildMinCap / egressMbCap   Raw override. null = no
                                              override → falls back to the
                                              platform default for that
                                              column.
  effective<Type>Cap                          Resolved value the rollup cron
                                              compares per-tenant consumption
                                              against (override ?? platform
                                              default). Surfacing both lets
                                              the admin distinguish "explicit
                                              cap that happens to equal the
                                              default" from "no override".
  present                                     false = no row exists. true =
                                              row exists, even if all
                                              columns are null (explicit
                                              "leave at defaults" intent).
`
    )
    .action(async (organizationId: string) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeOrgConsumptionCapResponse>(opts, {
          method: "GET",
          path: `/api/admin/vibe/consumption-cap/${encodeURIComponent(organizationId)}`
        });
        printConsumptionCapRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  cap
    .command("set")
    .description("Install / clear per-org consumption-cap overrides (tri-state PATCH)")
    .argument("<organizationId>", "Target organization id")
    .option(
      "--compute <int|none>",
      'Compute-minute cap override. Pass an int to install, "none" to clear, omit to leave untouched.'
    )
    .option(
      "--build <int|none>",
      'Build-minute cap override. Pass an int to install, "none" to clear, omit to leave untouched.'
    )
    .option(
      "--egress <int|none>",
      'Egress-MB cap override. Pass an int to install, "none" to clear, omit to leave untouched.'
    )
    .addHelpText(
      "after",
      `
Examples:
  Install a higher compute cap on a heavy customer (other columns untouched):
    $ nexus admin vibe-consumption-cap set org_abc --compute 50000

  Clear the compute override (back to platform default), bump build:
    $ nexus admin vibe-consumption-cap set org_abc --compute none --build 10000

  Forbid all egress for an under-investigation org:
    $ nexus admin vibe-consumption-cap set org_abc --egress 0

Notes:
  Tri-state PATCH — each flag has THREE meanings:
    - omitted        : the column is not in the request body. The backend
                       leaves the existing value untouched.
    - "none"         : the column is sent as JSON null. The backend clears
                       the override; the rollup will use the platform
                       default for that column going forward.
    - <integer>      : the column is sent as a non-negative integer. The
                       backend installs the override.

  At least one flag is required (empty body would be a no-op PATCH and is
  refused locally with exit 5, mirroring the backend's 422).
`
    )
    .action(
      async (
        organizationId: string,
        cmdOpts: { compute?: string; build?: string; egress?: string }
      ) => {
        try {
          const body: {
            computeMinCap?: CapPatchValue;
            buildMinCap?: CapPatchValue;
            egressMbCap?: CapPatchValue;
          } = {};
          if (cmdOpts.compute !== undefined) {
            body.computeMinCap = parseCapFlag("--compute", cmdOpts.compute);
          }
          if (cmdOpts.build !== undefined) {
            body.buildMinCap = parseCapFlag("--build", cmdOpts.build);
          }
          if (cmdOpts.egress !== undefined) {
            body.egressMbCap = parseCapFlag("--egress", cmdOpts.egress);
          }

          if (Object.keys(body).length === 0) {
            throw AdminCliError.localValidation(
              'At least one of --compute / --build / --egress is required. Pass an int to install, "none" to clear, omit to leave a column untouched.'
            );
          }

          const opts = resolveAdminOpts(program, admin);
          const data = await adminRequest<VibeOrgConsumptionCapResponse>(opts, {
            method: "PATCH",
            path: `/api/admin/vibe/consumption-cap/${encodeURIComponent(organizationId)}`,
            body
          });
          printConsumptionCapRecord(data);
        } catch (err) {
          process.exitCode = handleAdminError(err);
        }
      }
    );
}

/**
 * Parse a tri-state cap flag value. Returns:
 *   - null  for the literal string "none" (case-insensitive)
 *   - the parsed integer for anything else
 *
 * Throws `AdminCliError.localValidation` on NaN / negative / non-integer.
 * The caller is responsible for deciding whether to put the result in the
 * body (because the flag was present) or skip it (because the flag was
 * omitted). This function never sees the omitted case.
 */
function parseCapFlag(flag: string, raw: string): CapPatchValue {
  if (raw.trim().toLowerCase() === "none") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw AdminCliError.localValidation(
      `Invalid ${flag} value "${raw}". Expected a non-negative integer or "none".`
    );
  }
  return parsed;
}

// ============================================================
// vibe-tenant-cluster
// ============================================================
//
// Operator passthrough for the per-tenant data-plane lifecycle:
// provision opts an org into its own dedicated cluster, disable opts
// it back out (→ DISABLED_RETAINED; the teardown reaper destroys the
// stacks after the grace window). Thin shims over the backend's
// ProvisionTenantClusterUseCase / DisableTenantClusterUseCase.
//
// Wire shapes mirror packages/types/src/api/domains/admin/
// zadmin-vibe-tenant-cluster.ts — keep them in lockstep when the
// canonical schema evolves.

/**
 * Regions an operator may provision a tenant cluster into. Locked to EU
 * AWS regions for RGPD data residency — every tenant's data plane stays
 * in-region. Mirrors VIBE_ALLOWED_REGIONS in the backend schema; we
 * pre-validate here so a non-EU region is rejected locally before the
 * HTTP call (the backend's Zod boundary rejects it too). London
 * (eu-west-2) is intentionally absent — post-Brexit the UK is outside
 * the EU.
 */
const VIBE_ALLOWED_REGIONS = [
  "eu-west-1", // Ireland
  "eu-west-3", // Paris
  "eu-central-1", // Frankfurt
  "eu-north-1", // Stockholm
  "eu-south-1", // Milan
  "eu-south-2" // Spain
] as const;
type VibeAllowedRegion = (typeof VIBE_ALLOWED_REGIONS)[number];

function isVibeAllowedRegion(v: string): v is VibeAllowedRegion {
  return (VIBE_ALLOWED_REGIONS as readonly string[]).includes(v);
}

/**
 * Tenant-cluster lifecycle states — mirrors $Enums.VibeTenantClusterStatus.
 * The CLI never validates these locally (they only ever arrive from the
 * server in an outcome), so a plain type union is enough — no runtime array.
 */
type VibeTenantClusterStatus =
  | "PROVISIONING"
  | "HEALTHY"
  | "UPDATING"
  | "DEGRADED"
  | "DISABLING"
  | "DISABLED_RETAINED"
  | "DESTROYING"
  | "DESTROYED";

/** Discriminated outcome of an operator-triggered provision. */
type VibeTenantClusterProvisionOutcome =
  | { kind: "provisioning"; reprovisioned: boolean }
  | { kind: "already_active"; status: VibeTenantClusterStatus };

/** Discriminated outcome of an operator-triggered disable. */
type VibeTenantClusterDisableOutcome =
  | { kind: "retained"; retainUntil: string }
  | { kind: "already_retained" }
  | { kind: "not_found" }
  | { kind: "not_disablable"; status: VibeTenantClusterStatus };

function registerVibeTenantClusterCommands(admin: Command, program: Command): void {
  const tc = admin
    .command("vibe-tenant-cluster")
    .description("Provision / disable an org's dedicated Vibe data-plane cluster");

  tc.command("provision")
    .description("Opt an org into its own dedicated cluster (EU regions only — RGPD)")
    .argument("<organizationId>", "Target organization id")
    .requiredOption(
      "--region <region>",
      `Provisioning region. EU only: ${VIBE_ALLOWED_REGIONS.join(", ")}.`
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-tenant-cluster provision org_abc --region eu-west-1
  $ nexus admin vibe-tenant-cluster provision org_abc --region eu-central-1 --json

Outcome shapes:
  provisioning                A cluster row is PROVISIONING. reprovisioned=true
                              when re-opting-in from a retired cluster. The
                              reconcile loop converges it to HEALTHY.
  already_active              The org already has a live / mid-lifecycle
                              cluster; provision is a no-op (status shown).

Notes:
  --region is constrained to EU AWS regions for RGPD data residency,
  rejected locally before the HTTP call (mirrors the backend's Zod
  boundary). Operator-driven by design — Phase 1 provisioning is manual,
  not self-serve.
`
    )
    .action(async (organizationId: string, cmdOpts: { region: string }) => {
      try {
        const region = cmdOpts.region.trim();
        if (!isVibeAllowedRegion(region)) {
          throw AdminCliError.localValidation(
            `Invalid --region "${cmdOpts.region}". EU regions only (RGPD): ${VIBE_ALLOWED_REGIONS.join(", ")}.`
          );
        }

        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeTenantClusterProvisionOutcome>(opts, {
          method: "POST",
          path: "/api/admin/vibe/tenant-cluster/provision",
          body: { organizationId, region }
        });
        printProvisionOutcome(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  tc.command("disable")
    .description("Opt an org out of its dedicated cluster (→ DISABLED_RETAINED)")
    .argument("<organizationId>", "Target organization id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-tenant-cluster disable org_abc
  $ nexus admin vibe-tenant-cluster disable org_abc --json

Outcome shapes:
  retained          The cluster is now DISABLED_RETAINED; retainUntil is
                    the instant the teardown reaper may destroy it.
  already_retained  It was already retained — no-op.
  not_found         The org has no dedicated cluster.
  not_disablable    The cluster is in a state that is not a disable source
                    (PROVISIONING / UPDATING / a retired state); status
                    says which.

Notes:
  Disable is reversible until the grace window expires — re-provisioning
  a DISABLED_RETAINED org before the reaper runs resumes it. After the
  reaper destroys the stacks the org provisions fresh.
`
    )
    .action(async (organizationId: string) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeTenantClusterDisableOutcome>(opts, {
          method: "POST",
          path: "/api/admin/vibe/tenant-cluster/disable",
          body: { organizationId }
        });
        printDisableOutcome(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

// ============================================================
// vibe-build-job
// ============================================================
//
// Operator passthrough for the four build-job state-machine
// transitions. Future build runner drives the same use cases
// via DI; these CLI commands exist for QA + manual recovery.
//
// Wire shapes mirror packages/types/src/api/domains/admin/
// zadmin-vibe-build-job.ts. JSDoc cross-references keep the two
// in lockstep when the canonical schema evolves.

interface AdminVibeBuildJobResponse {
  id: string;
  vibeDeploymentId: string;
  organizationId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  builder: "NIXPACKS" | "DOCKERFILE";
  logsRef: string;
  durationMs: number | null;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
}

function registerVibeBuildJobCommands(admin: Command, program: Command): void {
  const bj = admin
    .command("vibe-build-job")
    .description("Drive the Vibe build-job state machine (claim / succeed / fail / time-out)");

  bj.command("claim")
    .description("PENDING → RUNNING. Records the live log-stream key.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id (tenant scope)")
    .requiredOption(
      "--logs-ref <s3Key>",
      "S3 key for the live build log stream. Required, non-empty."
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-build-job claim 11111111-1111-4111-8111-… \\
      --org org_abc --logs-ref s3://vibe-logs/2026-05-27/build-abc.log
`
    )
    .action(async (id: string, cmdOpts: { org: string; logsRef: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeBuildJobResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/build-jobs/${encodeURIComponent(id)}/claim`,
          body: { organizationId: cmdOpts.org, logsRef: cmdOpts.logsRef }
        });
        printBuildJobRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  bj.command("succeed")
    .description("RUNNING → SUCCEEDED. Records final durationMs + optional archived logs ref.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--duration-ms <n>", "Wallclock build time in milliseconds (non-negative int)")
    .option("--logs-ref <s3Key>", "Override the live-stream key with the archived final key")
    .action(async (id: string, cmdOpts: { org: string; durationMs: string; logsRef?: string }) => {
      try {
        const durationMs = parseDurationMs(cmdOpts.durationMs);
        const opts = resolveAdminOpts(program, admin);
        const body: { organizationId: string; durationMs: number; logsRef?: string } = {
          organizationId: cmdOpts.org,
          durationMs
        };
        if (cmdOpts.logsRef !== undefined) body.logsRef = cmdOpts.logsRef;
        const data = await adminRequest<AdminVibeBuildJobResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/build-jobs/${encodeURIComponent(id)}/succeed`,
          body
        });
        printBuildJobRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  bj.command("fail")
    .description("RUNNING → FAILED. Records errorReason verbatim for the CLI surface.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--duration-ms <n>", "Wallclock at failure (non-negative int)")
    .requiredOption("--error-reason <text>", "Customer-visible failure rationale (1-2000 chars)")
    .option("--logs-ref <s3Key>", "Override the live-stream key with the archived final key")
    .action(
      async (
        id: string,
        cmdOpts: { org: string; durationMs: string; errorReason: string; logsRef?: string }
      ) => {
        try {
          const durationMs = parseDurationMs(cmdOpts.durationMs);
          const opts = resolveAdminOpts(program, admin);
          const body: {
            organizationId: string;
            durationMs: number;
            errorReason: string;
            logsRef?: string;
          } = {
            organizationId: cmdOpts.org,
            durationMs,
            errorReason: cmdOpts.errorReason
          };
          if (cmdOpts.logsRef !== undefined) body.logsRef = cmdOpts.logsRef;
          const data = await adminRequest<AdminVibeBuildJobResponse>(opts, {
            method: "POST",
            path: `/api/admin/vibe/build-jobs/${encodeURIComponent(id)}/fail`,
            body
          });
          printBuildJobRecord(data);
        } catch (err) {
          process.exitCode = handleAdminError(err);
        }
      }
    );

  bj.command("time-out")
    .description("RUNNING → TIMED_OUT. Supervisor escape hatch when the runner went silent.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--duration-ms <n>", "Wallclock at timeout (non-negative int)")
    .option(
      "--error-reason <text>",
      'Override the canned "wallclock exceeded" surface (e.g. "Nomad allocation evicted").'
    )
    .action(
      async (id: string, cmdOpts: { org: string; durationMs: string; errorReason?: string }) => {
        try {
          const durationMs = parseDurationMs(cmdOpts.durationMs);
          const opts = resolveAdminOpts(program, admin);
          const body: { organizationId: string; durationMs: number; errorReason?: string } = {
            organizationId: cmdOpts.org,
            durationMs
          };
          if (cmdOpts.errorReason !== undefined) body.errorReason = cmdOpts.errorReason;
          const data = await adminRequest<AdminVibeBuildJobResponse>(opts, {
            method: "POST",
            path: `/api/admin/vibe/build-jobs/${encodeURIComponent(id)}/time-out`,
            body
          });
          printBuildJobRecord(data);
        } catch (err) {
          process.exitCode = handleAdminError(err);
        }
      }
    );
}

function parseDurationMs(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw AdminCliError.localValidation(
      `Invalid --duration-ms value "${raw}". Expected a non-negative integer.`
    );
  }
  return parsed;
}

function printBuildJobRecord(data: AdminVibeBuildJobResponse): void {
  printRecord(data as unknown as Record<string, unknown>, [
    { key: "id", label: "Build job" },
    { key: "vibeDeploymentId", label: "Deployment" },
    { key: "organizationId", label: "Organization" },
    { key: "status", label: "Status", format: formatBuildJobStatus },
    { key: "builder", label: "Builder" },
    { key: "logsRef", label: "Logs ref", format: (v) => (v === "" ? "—" : String(v)) },
    { key: "durationMs", label: "Duration (ms)", format: (v) => (v == null ? "—" : String(v)) },
    { key: "errorReason", label: "Error reason", format: (v) => (v == null ? "—" : String(v)) },
    { key: "createdAt", label: "Created" },
    { key: "updatedAt", label: "Updated" }
  ]);
}

function formatBuildJobStatus(v: unknown): string {
  const status = String(v);
  if (status === "FAILED" || status === "TIMED_OUT") return color.red(status);
  if (status === "RUNNING") return color.yellow(status);
  if (status === "SUCCEEDED") return color.green(status);
  return status;
}

// ============================================================
// vibe-deployment
// ============================================================
//
// Operator passthrough for the five deployment state-machine
// transitions. Symmetric to vibe-build-job — same orgId-in-body
// convention, same admin-http transport, same exit-code mapping.

interface AdminVibeDeploymentResponse {
  id: string;
  vibeAppId: string;
  organizationId: string;
  color: "BLUE" | "GREEN";
  status: "BUILDING" | "AWAITING_APPROVAL" | "DEPLOYING" | "HEALTHY" | "FAILED" | "ROLLED_BACK";
  triggerSha: string;
  imageRef: string;
  errorReason: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

function registerVibeDeploymentCommands(admin: Command, program: Command): void {
  const dep = admin
    .command("vibe-deployment")
    .description(
      "Drive the Vibe deployment state machine (build-succeeded / await-approval / begin-deploy / mark-healthy / mark-failed / mark-rolled-back)"
    );

  dep
    .command("build-succeeded")
    .description(
      "BUILDING → AWAITING_APPROVAL (if approval-request row exists) | DEPLOYING (otherwise). Stamps imageRef on the row in either branch."
    )
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--image-ref <ref>", "ECR image ref the build runner produced")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-deployment build-succeeded 11111111-1111-… \\
      --org org_abc --image-ref ecr/vibe/app:sha-abc123

Notes:
  Next-stage decision is the use case's, not the operator's. The use
  case queries the approval-request row for this deployment:
    - row exists → BUILDING → AWAITING_APPROVAL (waits for reviewer)
    - no row      → BUILDING → DEPLOYING (no approval gate)
  imageRef is stamped on the row in EITHER branch, so the approval
  reviewer sees the actual built image in the dashboard.
`
    )
    .action(async (id: string, cmdOpts: { org: string; imageRef: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/build-succeeded`,
          body: { organizationId: cmdOpts.org, imageRef: cmdOpts.imageRef }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  dep
    .command("await-approval")
    .description("BUILDING → AWAITING_APPROVAL")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .action(async (id: string, cmdOpts: { org: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/await-approval`,
          body: { organizationId: cmdOpts.org }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  dep
    .command("begin-deploy")
    .description("BUILDING | AWAITING_APPROVAL → DEPLOYING. Records imageRef on the row.")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--image-ref <ref>", "ECR image ref the build runner produced")
    .action(async (id: string, cmdOpts: { org: string; imageRef: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/begin-deploy`,
          body: { organizationId: cmdOpts.org, imageRef: cmdOpts.imageRef }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  dep
    .command("mark-healthy")
    .description("DEPLOYING → HEALTHY. ALB swap completed + health checks passed.")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .action(async (id: string, cmdOpts: { org: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/mark-healthy`,
          body: { organizationId: cmdOpts.org }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  dep
    .command("mark-failed")
    .description("Terminal failure from BUILDING | AWAITING_APPROVAL | DEPLOYING.")
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--error-reason <text>", "Customer-visible failure rationale (1-2000 chars)")
    .action(async (id: string, cmdOpts: { org: string; errorReason: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/mark-failed`,
          body: { organizationId: cmdOpts.org, errorReason: cmdOpts.errorReason }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  dep
    .command("mark-rolled-back")
    .description(
      "DEPLOYING | HEALTHY → ROLLED_BACK. Deployer's own post-flip health-check failure path (distinct from cost-safety auto-rollback)."
    )
    .argument("<id>", "Deployment UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--error-reason <text>", "Customer-visible rollback rationale (1-2000 chars)")
    .action(async (id: string, cmdOpts: { org: string; errorReason: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/deployments/${encodeURIComponent(id)}/mark-rolled-back`,
          body: { organizationId: cmdOpts.org, errorReason: cmdOpts.errorReason }
        });
        printDeploymentRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

function printDeploymentRecord(data: AdminVibeDeploymentResponse): void {
  printRecord(data as unknown as Record<string, unknown>, [
    { key: "id", label: "Deployment" },
    { key: "vibeAppId", label: "App" },
    { key: "organizationId", label: "Organization" },
    { key: "status", label: "Status", format: formatDeploymentStatus },
    { key: "color", label: "Color" },
    { key: "triggerSha", label: "Trigger sha" },
    { key: "imageRef", label: "Image ref", format: (v) => (v === "" ? "—" : String(v)) },
    { key: "errorReason", label: "Error reason", format: (v) => (v == null ? "—" : String(v)) },
    {
      key: "createdByUserId",
      label: "Created by",
      format: (v) => (v == null ? "system" : String(v))
    },
    { key: "createdAt", label: "Created" },
    { key: "updatedAt", label: "Updated" }
  ]);
}

function formatDeploymentStatus(v: unknown): string {
  const status = String(v);
  if (status === "FAILED" || status === "ROLLED_BACK") return color.red(status);
  if (status === "AWAITING_APPROVAL") return color.yellow(status);
  if (status === "HEALTHY") return color.green(status);
  return status;
}

// ============================================================
// vibe-rollback-sweep
// ============================================================

/**
 * Manual-trigger response shape. Mirrors `ZAdminHealth.TriggerCronJob.Response`
 * — message is always present, executionId + metadata are optional. The
 * actual metadata for the rollback sweep is `{ candidates, rolledBack,
 * auditEventCount }` per the cron handler; the value-type is `unknown`
 * because the trigger endpoint is generic over all crons.
 */
interface TriggerCronJobResponse {
  message: string;
  executionId?: string;
  metadata?: Record<string, unknown>;
}

const VIBE_ROLLBACK_SWEEP_CRON_KEY = "VIBE_COST_SAFETY_ROLLBACK_SWEEP";

function registerVibeRollbackSweepCommands(admin: Command, program: Command): void {
  const sweep = admin
    .command("vibe-rollback-sweep")
    .description("Operate the Vibe cost-safety rollback sweep cron");

  sweep
    .command("trigger")
    .description("Fire VIBE_COST_SAFETY_ROLLBACK_SWEEP immediately, bypassing the 5-min schedule")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-rollback-sweep trigger
  $ nexus admin vibe-rollback-sweep trigger --json

Why this exists:
  The rollback sweep runs every 5 minutes under normal operation. QA
  often needs the loop to close FASTER — e.g. "I just SUSPENDED an org
  via vibe-cost-safety set, sweep right now so I can see the rollback
  audit row land." This command hits the generic cron manual-trigger
  endpoint (POST /api/admin/health/cron-jobs/:jobName/trigger) with the
  pinned CronKey VIBE_COST_SAFETY_ROLLBACK_SWEEP.

  The execution log fields surface what happened — candidates =
  active deployments across all SUSPENDED orgs; rolledBack = how many
  actually flipped (a SMALLER number means a status-guarded UPDATE
  race-lost mid-sweep, which is expected and benign); auditEventCount
  matches rolledBack 1-to-1 because audit rows live INSIDE the per-row
  TX.
`
    )
    .action(async () => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<TriggerCronJobResponse>(opts, {
          method: "POST",
          path: `/api/admin/health/cron-jobs/${VIBE_ROLLBACK_SWEEP_CRON_KEY}/trigger`
        });
        printTriggerResult(data, [
          { key: "candidates", label: "Candidates", format: (v) => (v == null ? "—" : String(v)) },
          { key: "rolledBack", label: "Rolled back", format: (v) => (v == null ? "—" : String(v)) },
          {
            key: "auditEventCount",
            label: "Audit events",
            format: (v) => (v == null ? "—" : String(v))
          }
        ]);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

// ============================================================
// vibe-build-job-timeout-sweep
// ============================================================

const VIBE_BUILD_JOB_TIMEOUT_SWEEP_CRON_KEY = "VIBE_BUILD_JOB_TIMEOUT_SWEEP";

function registerVibeBuildJobTimeoutSweepCommands(admin: Command, program: Command): void {
  const sweep = admin
    .command("vibe-build-job-timeout-sweep")
    .description("Operate the Vibe build-job timeout sweep cron");

  sweep
    .command("trigger")
    .description("Fire VIBE_BUILD_JOB_TIMEOUT_SWEEP immediately, bypassing the 5-min schedule")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-build-job-timeout-sweep trigger
  $ nexus admin vibe-build-job-timeout-sweep trigger --json

Why this exists:
  The timeout sweep runs every 5 minutes under normal operation. A build
  job whose executor webhook never fires sits RUNNING forever (the
  build-runner tick only finds PENDING jobs, so it never re-encounters a
  RUNNING one). QA often needs to reap a stuck job NOW rather than wait
  for the next scheduled tick. This command hits the generic cron
  manual-trigger endpoint (POST /api/admin/health/cron-jobs/:jobName/
  trigger) with the pinned CronKey VIBE_BUILD_JOB_TIMEOUT_SWEEP.

  The execution-log metadata surfaces the outcome — kind is one of
  idle (no RUNNING jobs) / within_budget (oldest RUNNING not yet over the
  30-min budget) / timed_out (the FIFO-head job was reaped to TIMED_OUT
  with a BUILD_JOB_TIMED_OUT audit) / race_lost (the runner reported a
  terminal status between the read and the status-guarded write). The
  sweep reaps at most one job per tick (the most-stuck FIFO head); ageMs
  is its in-RUNNING age.
`
    )
    .action(async () => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<TriggerCronJobResponse>(opts, {
          method: "POST",
          path: `/api/admin/health/cron-jobs/${VIBE_BUILD_JOB_TIMEOUT_SWEEP_CRON_KEY}/trigger`
        });
        printTriggerResult(data, [
          { key: "kind", label: "Outcome", format: (v) => (v == null ? "—" : String(v)) },
          { key: "buildJobId", label: "Build job", format: (v) => (v == null ? "—" : String(v)) },
          {
            key: "ageMs",
            label: "In-RUNNING age",
            format: (v) => (typeof v === "number" ? `${Math.round(v / 60_000)}min` : "—")
          }
        ]);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

// ============================================================
// vibe-build-runner
// ============================================================
//
// Operator passthrough for one tick of the build-runner pipeline.
// Composes the DispatchNextPendingVibeBuildJobUseCase behind a
// simple HTTP shim. Used today for QA / dev / incident response;
// the future cron registers its CronKey via /migrate and wraps
// the same use case on a sub-second cadence.
//
// Wire shape mirrors packages/types/src/api/domains/admin/
// zadmin-vibe-build-runner.ts. JSDoc cross-references keep the
// two in lockstep when the canonical schema evolves.

/**
 * Discriminated outcome of one tick. Mirrors
 * `AdminVibeBuildRunnerTickOutcome` in the @nexus/types schema +
 * `DispatchNextVibeBuildJobOutcome` in the backend use case.
 * Exhaustiveness in `printTickRecord` is enforced via the never-
 * narrowing check — every new variant surfaces as a TS error at
 * the formatter rather than as a silent runtime branch.
 */
type AdminVibeBuildRunnerTickResponse =
  | { kind: "idle" }
  | { kind: "dispatched"; buildJobId: string }
  | { kind: "race_lost"; buildJobId: string }
  | {
      kind: "dispatch_failed_compensated";
      buildJobId: string;
      retryable: boolean;
      reason: string;
    };

function registerVibeBuildRunnerCommands(admin: Command, program: Command): void {
  const runner = admin
    .command("vibe-build-runner")
    .description("Operate the Vibe build-runner pipeline (manual tick)");

  runner
    .command("tick")
    .description(
      "Fire one tick: find next PENDING bundle → claim → dispatch → on failure compensate to FAILED"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-build-runner tick
  $ nexus admin vibe-build-runner tick --json

Why this exists:
  The build-runner cron is the production driver — sub-second cadence
  across all tenants. This admin command exists for QA + incident
  response: fire a tick now, see the structured outcome, repeat.

Outcome shapes:
  idle                              No PENDING jobs whose parent
                                    deployment is still BUILDING.
  dispatched                        A job was claimed AND handed off
                                    to the executor.
  race_lost                         Another runner claimed the job
                                    between find and our status-
                                    guarded UPDATE.
  dispatch_failed_compensated       The executor refused the job; we
                                    flipped RUNNING → FAILED. The
                                    'retryable' flag is informational
                                    (the user re-triggers either way
                                    for v1).
`
    )
    .action(async () => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeBuildRunnerTickResponse>(opts, {
          method: "POST",
          path: "/api/admin/vibe/build-runner/tick",
          body: {}
        });
        printTickRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

// ============================================================
// vibe-deployment-runner
// ============================================================
//
// Symmetric to vibe-build-runner. One tick of the deployer
// pipeline composing DispatchNextReadyVibeDeploymentUseCase.
//
// Wire shape mirrors packages/types/src/api/domains/admin/
// zadmin-vibe-deployment-runner.ts. JSDoc cross-references keep
// the two in lockstep when the canonical schema evolves.

/**
 * Discriminated outcome. Mirrors
 * `AdminVibeDeploymentRunnerTickOutcome` in the @nexus/types
 * schema + `DispatchNextReadyVibeDeploymentOutcome` in the backend
 * use case. No `race_lost` variant — the deployer has no claim
 * step (the row is already DEPLOYING when picked up).
 */
type AdminVibeDeploymentRunnerTickResponse =
  | { kind: "idle" }
  | { kind: "dispatched"; deploymentId: string }
  | {
      kind: "dispatch_failed_compensated";
      deploymentId: string;
      retryable: boolean;
      reason: string;
    }
  | { kind: "timed_out"; deploymentId: string; ageMs: number };

function registerVibeDeploymentRunnerCommands(admin: Command, program: Command): void {
  const runner = admin
    .command("vibe-deployment-runner")
    .description("Operate the Vibe deployer pipeline (manual tick)");

  runner
    .command("tick")
    .description(
      "Fire one tick: find next DEPLOYING+imageRef → dispatch → on failure compensate to FAILED"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-deployment-runner tick
  $ nexus admin vibe-deployment-runner tick --json

Why this exists:
  The deployer cron is the production driver — picks up DEPLOYING
  rows whose build runner has stamped imageRef, hands them off to
  the Nomad service + ALB target-group flip. This admin command
  exists for QA + incident response: fire a tick now, see the
  structured outcome, repeat.

Outcome shapes:
  idle                              No DEPLOYING+imageRef rows.
  dispatched                        A deployment was handed off to
                                    the executor.
  dispatch_failed_compensated       The executor refused the deploy;
                                    we flipped DEPLOYING → FAILED.
                                    'retryable' is informational
                                    (user re-triggers either way
                                    for v1).
  timed_out                         The deploy sat in DEPLOYING past
                                    the health budget (executor webhook
                                    never reported); reaped to FAILED
                                    instead of re-dispatching forever.

Re-dispatch behavior:
  Unlike the build-runner, there is no claim step. The row stays
  DEPLOYING from markBuildSucceeded until the executor webhook
  flips it. Repeated ticks may re-pick the same row; the dispatch
  port is idempotent (deterministic Nomad service name) so
  re-dispatch is a no-op at the executor.
`
    )
    .action(async () => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeDeploymentRunnerTickResponse>(opts, {
          method: "POST",
          path: "/api/admin/vibe/deployment-runner/tick",
          body: {}
        });
        printDeploymentTickRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

// ============================================================
// Output helpers
// ============================================================

function printDeploymentTickRecord(data: AdminVibeDeploymentRunnerTickResponse): void {
  switch (data.kind) {
    case "idle": {
      printRecord({ outcome: color.dim("idle (no DEPLOYING+imageRef rows)") }, [
        { key: "outcome", label: "Outcome" }
      ]);
      return;
    }
    case "dispatched": {
      printRecord({ outcome: color.green("dispatched"), deploymentId: data.deploymentId }, [
        { key: "outcome", label: "Outcome" },
        { key: "deploymentId", label: "Deployment" }
      ]);
      return;
    }
    case "dispatch_failed_compensated": {
      printRecord(
        {
          outcome: color.red("dispatch_failed_compensated"),
          deploymentId: data.deploymentId,
          retryable: data.retryable ? "yes (transient)" : "no (permanent)",
          reason: data.reason
        },
        [
          { key: "outcome", label: "Outcome" },
          { key: "deploymentId", label: "Deployment" },
          { key: "retryable", label: "Retryable" },
          { key: "reason", label: "Reason" }
        ]
      );
      return;
    }
    case "timed_out": {
      printRecord(
        {
          outcome: color.red("timed_out (reaped to FAILED)"),
          deploymentId: data.deploymentId,
          age: `${Math.round(data.ageMs / 60_000)}min stuck in DEPLOYING`
        },
        [
          { key: "outcome", label: "Outcome" },
          { key: "deploymentId", label: "Deployment" },
          { key: "age", label: "Stuck for" }
        ]
      );
      return;
    }
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled deployment tick outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// Both outcome printers forward the raw `data` dict to printRecord, which
// dumps it verbatim under --json — so the wire contract (the discriminated
// outcome) reaches stdout unchanged for `jq` consumers. TTY mode formats the
// labelled fields per variant. The exhaustive `never` default pins each
// formatter to the schema: a new outcome variant fails to compile here.

function printProvisionOutcome(data: VibeTenantClusterProvisionOutcome): void {
  const raw = data as unknown as Record<string, unknown>;
  switch (data.kind) {
    case "provisioning": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.green("provisioning") },
        {
          key: "reprovisioned",
          label: "Reprovisioned",
          format: (v) => (v ? "yes (re-opted-in from a retired cluster)" : "no")
        }
      ]);
      return;
    }
    case "already_active": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.dim("already_active (no-op)") },
        { key: "status", label: "Status" }
      ]);
      return;
    }
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled provision outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function printDisableOutcome(data: VibeTenantClusterDisableOutcome): void {
  const raw = data as unknown as Record<string, unknown>;
  switch (data.kind) {
    case "retained": {
      printRecord(raw, [
        {
          key: "kind",
          label: "Outcome",
          format: () => color.green("retained (DISABLED_RETAINED)")
        },
        { key: "retainUntil", label: "Reaper eligible" }
      ]);
      return;
    }
    case "already_retained": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.dim("already_retained (no-op)") }
      ]);
      return;
    }
    case "not_found": {
      printRecord(raw, [
        {
          key: "kind",
          label: "Outcome",
          format: () => color.yellow("not_found (org has no dedicated cluster)")
        }
      ]);
      return;
    }
    case "not_disablable": {
      printRecord(raw, [
        { key: "kind", label: "Outcome", format: () => color.red("not_disablable") },
        { key: "status", label: "Status" }
      ]);
      return;
    }
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled disable outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function printTickRecord(data: AdminVibeBuildRunnerTickResponse): void {
  // The discriminated union narrows to flat fields per variant. The
  // never-fallthrough check pins the formatter to the schema — any
  // future variant lands as a TS error here, not a silent default.
  switch (data.kind) {
    case "idle": {
      printRecord({ outcome: color.dim("idle (no PENDING jobs)") }, [
        { key: "outcome", label: "Outcome" }
      ]);
      return;
    }
    case "dispatched": {
      printRecord({ outcome: color.green("dispatched"), buildJobId: data.buildJobId }, [
        { key: "outcome", label: "Outcome" },
        { key: "buildJobId", label: "Build job" }
      ]);
      return;
    }
    case "race_lost": {
      printRecord({ outcome: color.yellow("race_lost"), buildJobId: data.buildJobId }, [
        { key: "outcome", label: "Outcome" },
        { key: "buildJobId", label: "Build job" }
      ]);
      return;
    }
    case "dispatch_failed_compensated": {
      printRecord(
        {
          outcome: color.red("dispatch_failed_compensated"),
          buildJobId: data.buildJobId,
          retryable: data.retryable ? "yes (transient)" : "no (permanent)",
          reason: data.reason
        },
        [
          { key: "outcome", label: "Outcome" },
          { key: "buildJobId", label: "Build job" },
          { key: "retryable", label: "Retryable" },
          { key: "reason", label: "Reason" }
        ]
      );
      return;
    }
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled tick outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function printCostSafetyRecord(data: VibeOrgCostSafetyStateResponse): void {
  // printRecord forwards the data dict verbatim when --json is set, so the
  // wire contract reaches stdout unchanged for `jq` consumers. In TTY mode
  // it formats the labelled fields below.
  printRecord(data as unknown as Record<string, unknown>, [
    { key: "organizationId", label: "Organization" },
    { key: "status", label: "Status", format: formatStatus },
    {
      key: "suspendedReason",
      label: "Suspended reason",
      format: (v) => (v == null ? "—" : String(v))
    },
    { key: "present", label: "Row present", format: (v) => (v ? "yes" : "no (defaulting to OK)") },
    { key: "createdAt", label: "Created", format: (v) => (v == null ? "—" : String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => (v == null ? "—" : String(v)) }
  ]);
}

function formatStatus(v: unknown): string {
  const status = String(v);
  if (status === "SUSPENDED") return color.red(status);
  if (status === "WARNING") return color.yellow(status);
  if (status === "OK") return color.green(status);
  return status;
}

/**
 * Render a generic cron manual-trigger response. The wire shape is the
 * same for every cron (message + executionId + a per-cron `metadata`
 * bag); each caller supplies the `metadataFields` that flatten its own
 * metadata keys into readable rows. JSON mode falls through to the
 * dict-as-is so jq consumers still get the nested `metadata` envelope.
 */
function printTriggerResult(
  data: TriggerCronJobResponse,
  metadataFields: { key: string; label: string; format?: (val: unknown) => string }[]
): void {
  const flat: Record<string, unknown> = {
    message: data.message,
    executionId: data.executionId ?? null,
    ...(data.metadata ?? {})
  };
  printRecord(flat, [
    { key: "message", label: "Result" },
    { key: "executionId", label: "Execution id", format: (v) => (v == null ? "—" : String(v)) },
    ...metadataFields
  ]);
}

function printConsumptionCapRecord(data: VibeOrgConsumptionCapResponse): void {
  printRecord(data as unknown as Record<string, unknown>, [
    { key: "organizationId", label: "Organization" },
    {
      key: "present",
      label: "Row present",
      format: (v) => (v ? "yes" : "no (using platform defaults)")
    },
    {
      key: "computeMinCap",
      label: "Compute override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveComputeMinCap", label: "Compute effective", format: (v) => String(v) },
    {
      key: "buildMinCap",
      label: "Build override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveBuildMinCap", label: "Build effective", format: (v) => String(v) },
    {
      key: "egressMbCap",
      label: "Egress override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveEgressMbCap", label: "Egress effective", format: (v) => String(v) },
    { key: "createdAt", label: "Created", format: (v) => (v == null ? "—" : String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => (v == null ? "—" : String(v)) }
  ]);
}

// ============================================================
// Option resolution
// ============================================================

/**
 * Merge globals from the program (--base-url, --profile) with admin-level
 * options (--admin-token). Subcommands then pass this into `adminRequest`.
 */
function resolveAdminOpts(program: Command, admin: Command): AdminHttpOptions {
  const globals = program.optsWithGlobals();
  const adminOpts = admin.opts();
  return {
    adminToken: adminOpts.adminToken as string | undefined,
    baseUrl: globals.baseUrl as string | undefined,
    profile: globals.profile as string | undefined
  };
}
