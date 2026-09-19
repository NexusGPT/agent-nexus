import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { printVibeCluster } from "../_shared/print-vibe-cluster";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";
import { type GetVibeClusterResponse } from "../_shared/vibe-cluster-wire";

/** `nexus apps cluster status` */
export function registerAppsClusterStatusCommand(cluster: Command, program: Command): Command {
  const leaf = cluster
    .command("status")
    .description("Show your org's dedicated cluster, or that it has none")
    .addHelpText(
      "after",
      `
Notes:
No cluster is not an error for every project shape: a git project created
with --git-url (bring-your-own-git) builds and deploys on shared
infrastructure and needs no cluster at all. A Nexus-hosted git project
(no --git-url) DOES need one — it stays PENDING until a healthy cluster
exists. A cluster is what lets Nexus HOST your code (the tenant git host)
and hold your secrets.

Examples:
  $ nexus apps cluster status
  $ nexus apps cluster status --json
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

  return leaf;
}
