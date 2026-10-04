import type { Command } from "commander";

import { registerDeploymentFolderAssignCommand } from "./assign.command";
import { registerDeploymentFolderCreateCommand } from "./create.command";
import { registerDeploymentFolderDeleteCommand } from "./delete.command";
import { registerDeploymentFolderListCommand } from "./list.command";
import { registerDeploymentFolderUpdateCommand } from "./update.command";

/** `nexus deployment folder …` — filing only; it grants nothing. */
export function registerDeploymentFolderCommands(deployment: Command, program: Command): void {
  const depFolder = deployment.command("folder").description("Manage deployment folders");

  depFolder.addHelpText(
    "after",
    `
A folder is filing only — it grants nothing and changes no runtime behaviour.
A deployment belongs to at most ONE folder, so "folder assign" MOVES it.

These run on their own scopes — deployment_folders:read / :write / :delete —
which a key holding deployments:* does not imply.`
  );

  registerDeploymentFolderListCommand(depFolder, program);
  registerDeploymentFolderCreateCommand(depFolder, program);
  registerDeploymentFolderUpdateCommand(depFolder, program);
  registerDeploymentFolderDeleteCommand(depFolder, program);
  registerDeploymentFolderAssignCommand(depFolder, program);
}
