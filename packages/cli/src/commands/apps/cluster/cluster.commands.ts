import type { Command } from "commander";

import { registerAppsClusterProvisionCommand } from "./provision.command";
import { registerAppsClusterStatusCommand } from "./status.command";

/**
 * An org's own cluster surface. The same two endpoints the console banner
 * drives, so a terminal never has to become a browser to get unblocked — the
 * operator path (`nexus admin vibe-tenant-cluster`) acts on ANOTHER org and is
 * not what a tenant reaches for.
 */
export function registerAppsClusterCommands(apps: Command, program: Command): void {
  const cluster = apps
    .command("cluster")
    .description("Provision / inspect your org's dedicated Vibe cluster");

  registerAppsClusterStatusCommand(cluster, program);
  registerAppsClusterProvisionCommand(cluster, program);
}
