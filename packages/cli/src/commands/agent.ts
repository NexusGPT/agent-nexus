import { Command } from "commander";

import { bindCommand } from "../contract-binding";
import {
  AGENT_CREATE_CONTRACT,
  AGENT_LIST_CONTRACT,
  AGENT_UPDATE_CONTRACT
} from "./agent.contract.generated";
import { AGENT_HELP } from "./agent/agent-help";
import { registerAgentCreateCommand } from "./agent/create.command";
import { registerAgentDeleteCommand } from "./agent/delete.command";
import { registerAgentDuplicateCommand } from "./agent/duplicate.command";
import { registerAgentGenerateProfilePictureCommand } from "./agent/generate-profile-picture.command";
import { registerAgentGetCommand } from "./agent/get.command";
import { registerAgentListCommand } from "./agent/list.command";
import { MODEL_CONFIG_TUNING } from "./agent/model-config-tuning";
import { registerAgentUpdateCommand } from "./agent/update.command";
import { registerAgentUploadProfilePictureCommand } from "./agent/upload-profile-picture.command";

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Manage AI agents");

  agent.addHelpText("after", AGENT_HELP);

  const list = registerAgentListCommand(agent, program);
  registerAgentGetCommand(agent, program);
  const create = registerAgentCreateCommand(agent, program);
  const update = registerAgentUpdateCommand(agent, program);
  registerAgentDeleteCommand(agent, program);
  registerAgentDuplicateCommand(agent, program);
  registerAgentUploadProfilePictureCommand(agent, program);
  registerAgentGenerateProfilePictureCommand(agent, program);

  // Bound LAST, after every option exists. `MODEL_CONFIG_TUNING` carries the
  // body-only declarations and the argument for each.
  bindCommand(list, AGENT_LIST_CONTRACT);
  bindCommand(create, AGENT_CREATE_CONTRACT, MODEL_CONFIG_TUNING);
  bindCommand(update, AGENT_UPDATE_CONTRACT, MODEL_CONFIG_TUNING);
}
