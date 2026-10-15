import { Command } from "commander";

import { registerFolderAssignCommand } from "./folder/assign.command";
import { registerFolderCreateCommand } from "./folder/create.command";
import { registerFolderDeleteCommand } from "./folder/delete.command";
import { registerFolderListCommand } from "./folder/list.command";
import { registerFolderUpdateCommand } from "./folder/update.command";

export function registerFolderCommands(program: Command): void {
  const folder = program
    .command("folder")
    .description("Manage AGENT folders — grouping only, never access control");

  folder.addHelpText(
    "after",
    `
AGENT FOLDERS ONLY. Skills, deployments and document templates have their own
folder surfaces ("nexus skill-folder ..."); nothing here touches them.

A FOLDER IS TIDINESS, NOT ACCESS. Filing an agent grants nobody anything and
revokes nothing. Use "nexus role" for who reaches what.

An agent sits in exactly ONE folder, so "folder assign" is a MOVE.

WHAT YOUR KEY CAN SEE: a key whose user role is org:member sees only the
folders that user created. "folder list" can therefore come back empty while
the organization has folders, and another user's folder id answers 404 on
get/update/delete/assign. An admin key, or a legacy key carrying no user, sees
the whole organization.`
  );

  registerFolderListCommand(folder, program);
  registerFolderCreateCommand(folder, program);
  registerFolderUpdateCommand(folder, program);
  registerFolderDeleteCommand(folder, program);
  registerFolderAssignCommand(folder, program);
}
