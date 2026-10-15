import { Command } from "commander";

import { registerSkillFolderAssignCommand } from "./skill-folder/assign.command";
import { registerSkillFolderCreateCommand } from "./skill-folder/create.command";
import { registerSkillFolderDeleteCommand } from "./skill-folder/delete.command";
import { registerSkillFolderListCommand } from "./skill-folder/list.command";
import { registerSkillFolderUpdateCommand } from "./skill-folder/update.command";

export function registerSkillFolderCommands(program: Command): void {
  const skillFolder = program.command("skill-folder").description("Manage skill folders");

  registerSkillFolderListCommand(skillFolder, program);
  registerSkillFolderCreateCommand(skillFolder, program);
  registerSkillFolderUpdateCommand(skillFolder, program);
  registerSkillFolderDeleteCommand(skillFolder, program);
  registerSkillFolderAssignCommand(skillFolder, program);
}
