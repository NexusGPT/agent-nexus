/**
 * `nexus admin vibe-tenant-cluster …` — the per-tenant data-plane lifecycle.
 *
 * Two verbs over one resource. `provision` opts an org into its own dedicated
 * cluster, `disable` opts it back out to DISABLED_RETAINED and leaves the
 * teardown reaper to destroy the stacks after the grace window.
 *
 * Both responses are DISCRIMINATED outcomes rather than a flat record, which
 * is why this module carries two printers instead of reusing a shared one: the
 * exhaustive `never` default in each pins the formatter to the schema, so a new
 * outcome variant fails to compile here rather than printing as a blank row.
 */

import { Command } from "commander";

import {
  type VibeTenantClusterDisableOutcome,
  type VibeTenantClusterProvisionOutcome
} from "../admin-wire-types";
import { color, printRecord } from "../output";
import { AdminCliError, handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";
import { isVibeAllowedRegion, VIBE_ALLOWED_REGIONS } from "../vibe-regions";

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
                              when re-opting-in from a retired cluster. The
                              reconcile loop converges it to HEALTHY.
  already_active              The org already has a live / mid-lifecycle
                              cluster; provision is a no-op (status shown).

Notes:
  --region is constrained to EU AWS regions for RGPD data residency,
  rejected locally before the HTTP call (mirrors the backend's Zod
  boundary). This is the cross-org OPERATOR path; an org provisions its
  own cluster with "nexus vibe cluster provision" or from its console.
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

// Both outcome printers forward the raw `data` dict to printRecord, which
// dumps it verbatim under --json — so the wire contract (the discriminated
// outcome) reaches stdout unchanged for `jq` consumers. TTY mode formats the
// labelled fields per variant. The exhaustive `never` default pins each
// formatter to the schema: a new outcome variant fails to compile here.

function printProvisionOutcome(data: VibeTenantClusterProvisionOutcome): void {
  const raw: Record<string, unknown> = data;
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
  const raw: Record<string, unknown> = data;
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
