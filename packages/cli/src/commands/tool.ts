import { Command } from "commander";

import { registerToolConnectCommand } from "./tool/connect.command";
import { registerToolConnectionStatusCommand } from "./tool/connection-status.command";
import { registerToolCreateCredentialCommand } from "./tool/create-credential.command";
import { registerToolCredentialsCommand } from "./tool/credentials.command";
import { registerToolDeleteCredentialCommand } from "./tool/delete-credential.command";
import { registerToolExecuteCommand } from "./tool/execute.command";
import { registerToolGetCommand } from "./tool/get.command";
import { registerToolResolveOptionsCommand } from "./tool/resolve-options.command";
import { registerToolSearchCommand } from "./tool/search.command";
import { registerToolSkillsCommand } from "./tool/skills.command";
import { registerToolTestCommand } from "./tool/test.command";

export function registerToolCommands(program: Command): void {
  const tool = program.command("tool").description("Discover and manage marketplace tools");

  registerToolSearchCommand(tool, program);
  registerToolGetCommand(tool, program);
  registerToolCredentialsCommand(tool, program);
  registerToolConnectCommand(tool, program);
  registerToolResolveOptionsCommand(tool, program);
  registerToolSkillsCommand(tool, program);
  registerToolTestCommand(tool, program);
  registerToolExecuteCommand(tool, program);
  registerToolConnectionStatusCommand(tool, program);
  registerToolCreateCredentialCommand(tool, program);
  registerToolDeleteCredentialCommand(tool, program);
}
