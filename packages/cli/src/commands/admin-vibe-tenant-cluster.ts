/**
 * `nexus admin vibe-tenant-cluster …` — the per-tenant data-plane lifecycle.
 *
 * Four verbs over one resource. `provision` opts an org into its own dedicated
 * cluster, `disable` opts it back out to DISABLED_RETAINED and leaves the
 * teardown reaper to destroy the stacks after the grace window. `force-converge`
 * and `complete-teardown` are the operator repair levers — they already existed
 * on the backend (`AdminVibeTenantClusterController`) with no CLI path to reach
 * them; this file is what closes that gap (NEX-4213).
 *
 * 🔴 `force-converge` IS NOT A GENERAL "UNSTICK A DEGRADED CLUSTER" LEVER — read
 * its own `--help` before reaching for it. It is HEALTHY-only: the reconcile
 * loop already retries `pulumi up` on PROVISIONING / UPDATING / DEGRADED every
 * tick on its own, so calling this against an already-DEGRADED cluster returns
 * `already_converging` and writes nothing. Its actual job is unsticking a
 * HEALTHY cluster whose drift PREVIEW is wrong (reports clean while a declared
 * resource is missing live) — the one state the loop cannot self-correct from,
 * because HEALTHY is only observed, never driven.
 *
 * All four responses are DISCRIMINATED outcomes rather than a flat record, so
 * each has its own printer instead of a shared one — in
 * `admin-vibe-tenant-cluster.print-lifecycle.ts` and `.print-repair.ts`, where
 * the exhaustive `never` default pins each to the schema and a kind newer than
 * this binary prints as the server's word.
 */

import { Command } from "commander";

import {
  type VibeTenantClusterCompleteTeardownOutcomeRead,
  type VibeTenantClusterDisableOutcomeRead,
  type VibeTenantClusterForceConvergeOutcomeRead,
  type VibeTenantClusterProvisionOutcomeRead
} from "../admin-vibe-tenant-cluster-wire-types";
import { AdminCliError, handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";
import { isVibeAllowedRegion, VIBE_ALLOWED_REGIONS } from "../vibe-regions";
import {
  printDisableOutcome,
  printProvisionOutcome
} from "./admin-vibe-tenant-cluster.print-lifecycle";
import {
  printCompleteTeardownOutcome,
  printForceConvergeOutcome
} from "./admin-vibe-tenant-cluster.print-repair";

export function registerVibeTenantClusterCommands(admin: Command, program: Command): void {
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
                              when re-opting-in from a retired cluster.
                              reusedExistingRow=true (--json only) when the
                              row was already PROVISIONING and was reused —
                              nothing new was declared; absent on a fresh
                              create and on a re-provision. The reconcile
                              loop converges it to HEALTHY.
  already_active              The org already has a live / mid-lifecycle
                              cluster; provision is a no-op (status shown).

Notes:
  --region is constrained to EU AWS regions for RGPD data residency,
  rejected locally before the HTTP call (mirrors the backend's Zod
  boundary). This is the cross-org OPERATOR path; an org provisions its
  own cluster with "nexus apps cluster provision" or from its console.
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
        const data = await adminRequest<VibeTenantClusterProvisionOutcomeRead>(opts, {
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
        const data = await adminRequest<VibeTenantClusterDisableOutcomeRead>(opts, {
          method: "POST",
          path: "/api/admin/vibe/tenant-cluster/disable",
          body: { organizationId }
        });
        printDisableOutcome(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  tc.command("force-converge")
    .description("Force a HEALTHY cluster whose drift preview is wrong to converge")
    .argument("<organizationId>", "Target organization id")
    .requiredOption(
      "--reason <text>",
      "Why you are forcing this. Becomes the cluster's statusReason on success — required."
    )
    .addHelpText(
      "after",
      `
🔴 HEALTHY-only. The reconcile loop already retries PROVISIONING / UPDATING /
DEGRADED clusters every tick with no help from this command — see the
already_converging outcome below. This exists for the one state the loop
cannot self-correct: a HEALTHY cluster whose drift PREVIEW reports clean
while a declared resource is actually missing from live infrastructure, so
the loop never has a reason to degrade (and therefore converge) it.

Examples:
  $ nexus admin vibe-tenant-cluster force-converge org_abc --reason "drift preview missing the NAT gateway, confirmed via aws ec2 describe-nat-gateways"

Outcome shapes:
  forced               HEALTHY → DEGRADED, converges on the next tick.
  already_converging   No-op — already PROVISIONING / UPDATING / DEGRADED,
                        which the loop already converges every tick.
  reconcile_paused      No-op — an operator is holding this cluster out
                        of the sweep with reconcile-pause. Release the
                        pause first, or nothing will ever converge.
  not_converging        Refused — a draining/retired cluster has no
                        desired state to converge toward.
  not_found             The org has no dedicated cluster.

Notes:
  It writes one column and returns; the reconcile cron does the actual
  apply under its crash-safe lease. "forced" means a converge WILL run on
  the next tick, not that one already has.

  --reason is mandatory and becomes the cluster's statusReason, so it is
  what the next operator reads to understand why the cluster left HEALTHY.
  Say what you verified, not that you forced it.

  There is no admin CLI verb to poll a single cluster's status yet — check
  the admin panel, or GET /api/admin/vibe/tenant-cluster for the fleet
  roster.
`
    )
    .action(async (organizationId: string, cmdOpts: { reason: string }) => {
      try {
        const reason = cmdOpts.reason.trim();
        if (reason.length === 0) {
          throw AdminCliError.localValidation("--reason cannot be empty.");
        }

        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeTenantClusterForceConvergeOutcomeRead>(opts, {
          method: "POST",
          path: "/api/admin/vibe/tenant-cluster/force-converge",
          body: { organizationId, reason }
        });
        printForceConvergeOutcome(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  tc.command("complete-teardown")
    .description("Mark a wedged DESTROYING cluster DESTROYED (escape hatch, NEX-2869)")
    .argument("<organizationId>", "Target organization id")
    .requiredOption(
      "--confirmation <text>",
      "Your attestation that this org's infrastructure is confirmed gone, and HOW " +
        "you checked (not merely why you're running this). Becomes the cluster's " +
        "terminal statusReason — required."
    )
    .addHelpText(
      "after",
      `
🚨 DELIBERATE BYPASS OF THE AUTOMATED SAFETY CHECK. Only for a cluster whose
\`pulumi destroy\` already ran but whose final DESTROYING → DESTROYED write
never landed (a crash, or the write itself failed) — the reaper's own
capture gate then refuses forever, because it cannot tell "never protected"
apart from "already destroyed" once the AWS Backup plans are gone. This
command skips that gate and writes DESTROYED directly, on the strength of
YOUR verification against real AWS, not the automation's.

Examples:
  $ nexus admin vibe-tenant-cluster complete-teardown org_abc --confirmation "verified zero EC2/RDS/S3 resources tagged organizationId=org_abc in eu-west-3 via console, 2026-08-20"

Outcome shapes:
  destroyed          DESTROYING → DESTROYED. Your confirmation is now the
                      cluster's terminal statusReason.
  already_destroyed  No-op — the reaper (or another operator) already
                      finished this.
  not_destroying     Refused — the cluster exists but is not DESTROYING;
                      status says what it actually is. This command only
                      COMPLETES an already-claimed teardown, it never starts
                      one.
  not_found           The org has no dedicated cluster row at all.

Notes:
  Never use this to abandon a cluster that has not actually been torn
  down — it does not run \`pulumi destroy\`, it only records that one
  already ran. Refuses outright on anything not already DESTROYING.

  --confirmation is mandatory and becomes the terminal statusReason, so
  it is the only surviving record of HOW the teardown was verified. Name
  what you checked and where, not why you ran the command.

  The write is a status-guarded compare-and-swap, so it is safe to re-run:
  losing the race to the reaper (or to a second operator) reports
  already_destroyed rather than writing twice.
`
    )
    .action(async (organizationId: string, cmdOpts: { confirmation: string }) => {
      try {
        const confirmation = cmdOpts.confirmation.trim();
        if (confirmation.length === 0) {
          throw AdminCliError.localValidation("--confirmation cannot be empty.");
        }

        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeTenantClusterCompleteTeardownOutcomeRead>(opts, {
          method: "POST",
          path: "/api/admin/vibe/tenant-cluster/complete-teardown",
          body: { organizationId, confirmation }
        });
        printCompleteTeardownOutcome(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}
