import { Command } from "commander";

import { registerAgentToolAttachCollectionCommand } from "./agent-tool/attach-collection.command";
import { registerAgentToolCreateCommand } from "./agent-tool/create.command";
import { registerAgentToolDeleteCommand } from "./agent-tool/delete.command";
import { registerAgentToolGetCommand } from "./agent-tool/get.command";
import { registerAgentToolListCommand } from "./agent-tool/list.command";
import { registerAgentToolUpdateCommand } from "./agent-tool/update.command";

export function registerAgentToolCommands(program: Command): void {
  const agentTool = program.command("agent-tool").description("Manage agent tool configurations");

  agentTool.addHelpText(
    "after",
    `
A tool config belongs to one agent, so <agent-id> always comes first, and
<tool-id> is the CONFIG id from "nexus agent-tool list" — never the marketplace
tool id, which lives at config.toolId inside the config.

Two facts decide whether a config does anything at run time:
  • A WORKFLOW tool must name a PUBLISHED workflow. Attaching a DRAFT is
    accepted with a 201 and the tool then never fires — no error at create and
    none at run time. Publish it first with "nexus workflow publish".
  • agentInputSchema is REQUIRED on create and is stored FLAT: a map of parameter
    name → JSON Schema. It is spread straight into the model's function
    definition, so a wrapped document stored raw yields a tool the provider
    rejects and the agent never sees. Send {} when the agent passes no arguments.`
  );

  registerAgentToolListCommand(agentTool, program);
  registerAgentToolGetCommand(agentTool, program);
  registerAgentToolCreateCommand(agentTool, program);
  registerAgentToolUpdateCommand(agentTool, program);
  registerAgentToolDeleteCommand(agentTool, program);
  registerAgentToolAttachCollectionCommand(agentTool, program);
}
