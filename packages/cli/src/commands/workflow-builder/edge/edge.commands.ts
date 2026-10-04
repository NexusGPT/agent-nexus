import type { Command } from "commander";

import { registerWorkflowEdgeCreateCommand } from "./create.command";
import { registerWorkflowEdgeDeleteCommand } from "./delete.command";

/** `nexus workflow edge …` — the edge sub-group. */
export function registerWorkflowEdgeCommands(workflow: Command, program: Command): void {
  const edge = workflow
    .command("edge")
    .description("Manage workflow edges (connections between nodes)");

  registerWorkflowEdgeCreateCommand(edge, program);
  registerWorkflowEdgeDeleteCommand(edge, program);
}
