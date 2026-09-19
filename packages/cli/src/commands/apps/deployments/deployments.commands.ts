import type { Command } from "commander";

import { registerAppsDeploymentsGetCommand } from "./get.command";
import { registerAppsDeploymentsListCommand } from "./list.command";

/** Registers every `nexus apps deployments` leaf, in registration order. */
export function registerAppsDeploymentsCommands(apps: Command, program: Command): void {
  const deployments = apps.command("deployments").description("Inspect an app's deployments");

  registerAppsDeploymentsListCommand(deployments, program);
  registerAppsDeploymentsGetCommand(deployments, program);
}
