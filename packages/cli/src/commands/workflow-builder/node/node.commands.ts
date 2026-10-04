import type { Command } from "commander";

import { registerWorkflowNodeCreateCommand } from "./create.command";
import { registerWorkflowNodeDeleteCommand } from "./delete.command";
import { registerWorkflowNodeGetCommand } from "./get.command";
import { registerWorkflowNodeOutputFormatCommand } from "./output-format.command";
import { registerWorkflowNodeReloadPropsCommand } from "./reload-props.command";
import { registerWorkflowNodeTestCommand } from "./test.command";
import { registerWorkflowNodeTestPayloadCommand } from "./test-payload.command";
import { registerWorkflowNodeUpdateCommand } from "./update.command";
import { registerWorkflowNodeVariablesCommand } from "./variables.command";

/** `nexus workflow node …` — the node sub-group. */
export function registerWorkflowNodeCommands(workflow: Command, program: Command): void {
  const node = workflow.command("node").description("Manage workflow nodes");

  registerWorkflowNodeCreateCommand(node, program);
  registerWorkflowNodeGetCommand(node, program);
  registerWorkflowNodeUpdateCommand(node, program);
  registerWorkflowNodeDeleteCommand(node, program);
  registerWorkflowNodeTestCommand(node, program);
  registerWorkflowNodeVariablesCommand(node, program);
  registerWorkflowNodeOutputFormatCommand(node, program);
  registerWorkflowNodeTestPayloadCommand(node, program);
  registerWorkflowNodeReloadPropsCommand(node, program);
}
