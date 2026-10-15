import type { Command } from "commander";

import { registerTemplateFolderAssignCommand } from "./assign.command";
import { registerTemplateFolderCreateCommand } from "./create.command";
import { registerTemplateFolderDeleteCommand } from "./delete.command";
import { registerTemplateFolderListCommand } from "./list.command";
import { registerTemplateFolderUpdateCommand } from "./update.command";

/** `nexus template folder …` */
export function registerTemplateFolderCommands(template: Command, program: Command): void {
  const tplFolder = template.command("folder").description("Manage document template folders");

  tplFolder.addHelpText(
    "after",
    `
Folders organize templates in the dashboard. They hold no content and change
nothing about generation — a template in no folder works exactly the same.

The string "null" is the way to say "no parent" and "no folder": it is read as a
null, not stored as the four characters. That is the only way to move a folder to
the root or detach a template.`
  );

  registerTemplateFolderListCommand(tplFolder, program);
  registerTemplateFolderCreateCommand(tplFolder, program);
  registerTemplateFolderUpdateCommand(tplFolder, program);
  registerTemplateFolderDeleteCommand(tplFolder, program);
  registerTemplateFolderAssignCommand(tplFolder, program);
}
