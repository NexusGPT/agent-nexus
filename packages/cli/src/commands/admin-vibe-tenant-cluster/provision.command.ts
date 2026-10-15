/**
 * `nexus admin vibe-tenant-cluster provision` — opt an org into its own cluster.
 *
 * `--region` is constrained to EU AWS regions for RGPD data residency and is
 * refused locally, before the HTTP call, mirroring the backend's Zod boundary.
 * This is the cross-org OPERATOR path; an org provisions its own cluster with
 * `nexus apps cluster provision` or from its console.
 */

import type { Command } from "commander";

import { type VibeTenantClusterProvisionOutcomeRead } from "../../admin-vibe-tenant-cluster-wire-types";
import { AdminCliError, handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { isVibeAllowedRegion, VIBE_ALLOWED_REGIONS } from "../../vibe-regions";
import { printProvisionOutcome } from "../admin-vibe-tenant-cluster.print-lifecycle";

const HELP = `
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
`;

/** Registers the verb on the `vibe-tenant-cluster` command group. */
export function registerVibeTenantClusterProvisionCommand(
  tc: Command,
  admin: Command,
  program: Command
): void {
  tc.command("provision")
    .description("Opt an org into its own dedicated cluster (EU regions only — RGPD)")
    .argument("<organizationId>", "Target organization id")
    .requiredOption(
      "--region <region>",
      `Provisioning region. EU only: ${VIBE_ALLOWED_REGIONS.join(", ")}.`
    )
    .addHelpText("after", HELP)
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
}
