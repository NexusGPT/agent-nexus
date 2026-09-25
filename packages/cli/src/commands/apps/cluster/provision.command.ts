import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { isVibeAllowedRegion, VIBE_ALLOWED_REGIONS } from "../../../vibe-regions";
import { printProvisionOutcome } from "../_shared/print-provision-outcome";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";
import { type ProvisionVibeClusterResponse } from "../_shared/vibe-cluster-wire";

/** `nexus apps cluster provision` */
export function registerAppsClusterProvisionCommand(cluster: Command, program: Command): Command {
  const leaf = cluster
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
"nexus apps cluster status".

Idempotent: running it again while PROVISIONING, or against a cluster
that is already live, reports the current state instead of erroring.

With --json, a call that landed on a row already PROVISIONING carries
reusedExistingRow: true on its "provisioning" outcome — it declared nothing
new. The field is absent on a fresh create and on a re-provision.

Examples:
  $ nexus apps cluster provision --region eu-west-3
  $ nexus apps cluster provision --region eu-central-1 --json
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

  return leaf;
}
