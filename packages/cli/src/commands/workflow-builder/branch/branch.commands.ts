import type { Command } from "commander";

import { registerWorkflowBranchCreateCommand } from "./create.command";
import { registerWorkflowBranchDeleteCommand } from "./delete.command";
import { registerWorkflowBranchListCommand } from "./list.command";
import { registerWorkflowBranchUpdateCommand } from "./update.command";

/** `nexus workflow branch …` — the branch sub-group. */
export function registerWorkflowBranchCommands(workflow: Command, program: Command): void {
  const branch = workflow
    .command("branch")
    .description("Manage branches on condition/router nodes");

  registerWorkflowBranchListCommand(branch, program);
  registerWorkflowBranchCreateCommand(branch, program);
  registerWorkflowBranchUpdateCommand(branch, program);
  registerWorkflowBranchDeleteCommand(branch, program);
}
