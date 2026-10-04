import type { Command } from "commander";

import { registerWorkflowBranchCommands } from "./workflow-builder/branch/branch.commands";
import { registerWorkflowEdgeCommands } from "./workflow-builder/edge/edge.commands";
import { registerWorkflowLayoutCommand } from "./workflow-builder/layout.command";
import { registerWorkflowNodeCommands } from "./workflow-builder/node/node.commands";
import { registerWorkflowNodeTypeCommand } from "./workflow-builder/node-type.command";
import { registerWorkflowNodeTypesCommand } from "./workflow-builder/node-types.command";
import { registerWorkflowOverviewCommand } from "./workflow-builder/overview.command";
import { registerWorkflowPlatformListenerEventsCommand } from "./workflow-builder/platform-listener-events.command";
import { registerWorkflowTriggerCommand } from "./workflow-builder/trigger.command";

export function registerWorkflowBuilderCommands(workflow: Command, program: Command): void {
  registerWorkflowNodeCommands(workflow, program);
  registerWorkflowEdgeCommands(workflow, program);
  registerWorkflowBranchCommands(workflow, program);

  registerWorkflowNodeTypesCommand(workflow, program);
  registerWorkflowNodeTypeCommand(workflow, program);
  registerWorkflowPlatformListenerEventsCommand(workflow, program);
  registerWorkflowOverviewCommand(workflow, program);
  registerWorkflowLayoutCommand(workflow, program);
  registerWorkflowTriggerCommand(workflow, program);
}
