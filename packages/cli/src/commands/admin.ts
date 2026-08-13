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
 * No admin-panel UI exists for Vibe (`06-open-questions §8`); this CLI is the
 * operator's only surface.
 *
 * This module is the entry point and nothing else. Each command group owns its
 * own file — its verbs, its flag parsers and its printers together — because
 * the groups share no code and reading one used to mean scrolling past six
 * others. The one exception is the two cron-trigger groups, which share a
 * response shape and a printer and therefore share a module.
 *
 * The `Subcommands` block below is the only place that lists them all, so it
 * needs updating when a group is added.
 */

import { Command } from "commander";

import { registerVibeBuildJobCommands } from "./admin-vibe-build-job";
import { registerVibeBuildRunnerCommands } from "./admin-vibe-build-runner";
import { registerVibeConsumptionCapCommands } from "./admin-vibe-consumption-cap";
import { registerVibeCostSafetyCommands } from "./admin-vibe-cost-safety";
import {
  registerVibeBuildJobTimeoutSweepCommands,
  registerVibeRollbackSweepCommands
} from "./admin-vibe-cron-sweeps";
import { registerVibeDeploymentCommands } from "./admin-vibe-deployment";
import { registerVibeDeploymentRunnerCommands } from "./admin-vibe-deployment-runner";
import { registerVibeTenantClusterCommands } from "./admin-vibe-tenant-cluster";

export function registerAdminCommands(program: Command): void {
  const admin = program
    .command("admin")
    .description("Platform-operator commands (admin token required)")
    .addHelpText(
      "after",
      `
🚨 EVERY SUBCOMMAND HERE ACTS ON ANOTHER ORGANIZATION'S PRODUCTION STATE, AND
MOST OF THEM SPEND MONEY. This is the platform operator's surface, not yours:
cluster provisioning stands up real paid infrastructure for a tenant, the
runner and sweep verbs fire real pipeline ticks against live deployments, and a
cost-safety or consumption-cap write changes what a customer is allowed to
spend. Nothing here is scoped to your own organization and nothing is a
rehearsal. Read the org id you typed twice.

Authentication:
  Admin endpoints require a Clerk JWT, not an org API key. Set
  NEXUS_ADMIN_TOKEN or pass --admin-token <jwt> on the subcommand.
  Grab the JWT from gpt.nexus DevTools → Network → any request →
  Authorization header (the "Bearer eyJ..." value).

  CHECK THE TOKEN BEFORE YOU DRIVE ANYTHING WITH IT. Every listed subcommand
  changes operator state, so there is no harmless verb to typo-test on except
  this read, which touches nothing and answers OK even for an org with no row:

    $ nexus admin vibe-cost-safety get <organizationId>

  Exit 2 means the token is missing or invalid; exit 3 means it parsed and the
  identity lacks the permission. Those are different problems — a fresh JWT
  fixes the first and nothing but a permission grant fixes the second.

Subcommands:
  vibe-cost-safety     List the gated fleet; read/write one org's state
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
