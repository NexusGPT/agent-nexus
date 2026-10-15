import { Command } from "commander";

import { registerUserGroupAddMemberCommand } from "./user-group/add-member.command";
import { registerUserGroupCreateCommand } from "./user-group/create.command";
import { registerUserGroupDeleteCommand } from "./user-group/delete.command";
import { registerUserGroupListCommand } from "./user-group/list.command";
import { registerUserGroupRemoveMemberCommand } from "./user-group/remove-member.command";
import { registerUserGroupUpdateCommand } from "./user-group/update.command";

export function registerUserGroupCommands(program: Command): void {
  const userGroup = program
    .command("user-group")
    .description("Manage user groups — the group principal a permission grant names");

  userGroup.addHelpText(
    "after",
    `
THREE ENVELOPES IN ONE NAMESPACE, AND ONLY ONE OF THEM CARRIES memberUserIds.
Under --json the same group comes back three different ways, so a script that
reads the membership after a write has to know which verb it just called:

  list                    {"data":[{id, name, description, createdAt,
                          memberUserIds, memberCount}]}   ← the only READ
  create · update         {success, message, id, name, memberCount}
                          NO memberUserIds. The write landed; the membership is
                          simply not in the answer. Do not read this as empty.
  add-member              the WHOLE group object, BARE — no "success" key and
  remove-member           no "data" wrapper, memberUserIds included.

So: parse ".data[]" after list, the top level after a membership write, and
neither after create or update — go back to list for the ids.

THERE IS NO "user-group get" AND NO GET ROUTE BEHIND ONE. "list" is the whole
read surface; select the row you want out of it by id.

EVERY VERB HERE NEEDS THE org:admin ROLE ON TOP OF ITS SCOPE — all six routes
check it, reads included. A correctly scoped key held by a non-admin is a 403,
never an empty list.`
  );

  // REGISTRATION ORDER IS THE ORDER `--help` LISTS THEM, so it is part of the
  // published surface rather than a detail of this file.
  registerUserGroupListCommand(userGroup, program);
  registerUserGroupCreateCommand(userGroup, program);
  registerUserGroupUpdateCommand(userGroup, program);
  registerUserGroupAddMemberCommand(userGroup, program);
  registerUserGroupRemoveMemberCommand(userGroup, program);
  registerUserGroupDeleteCommand(userGroup, program);
}
