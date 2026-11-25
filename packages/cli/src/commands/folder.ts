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

WHAT YOUR KEY CAN SEE: folders are shared across the organization, whoever
created them. Any key in the organization — member or admin — lists, reads
and changes every one of its folders, subject only to the key's scopes:
folders:read for "folder list", folders:write for create/update/assign, and
folders:delete for delete. Only a folder id from another organization answers
404, the same 404 as an id that exists nowhere.`
  );

  registerFolderListCommand(folder, program);
  registerFolderCreateCommand(folder, program);
  registerFolderUpdateCommand(folder, program);
  registerFolderDeleteCommand(folder, program);
  registerFolderAssignCommand(folder, program);
}
