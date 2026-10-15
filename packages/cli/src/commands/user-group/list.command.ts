import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { USER_GROUPS_LIST_CONTRACT } from "../user-group.contract.generated";

/** `nexus user-group list` */
export function registerUserGroupListCommand(userGroup: Command, program: Command): void {
  const list = userGroup
    .command("list")
    .description("List user groups")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus user-group list
  $ nexus user-group list --json

Notes:
  MEMBERS IS A COUNT, NOT A LIST — IN THE TABLE. --json carries memberUserIds
  on every row, so this command IS the read; the table simply does not print the
  column. THERE IS NO "user-group get": this list is the only read in the
  namespace, and the two membership writes echo the group back as well.
    $ nexus user-group list --json | jq -r '.data[] | select(.id=="<id>")'
  The ID column is a UUID and is what every other user-group verb takes. A group
  NAME is not unique and selects nothing.
  Members are Clerk user ids (user_…), which are a different id space from this
  group's UUID — do not pass one where the other belongs.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { userGroups } = await client.userGroups.list();
        printList(userGroups, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "memberCount", label: "MEMBERS", width: 8 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, USER_GROUPS_LIST_CONTRACT);
}
