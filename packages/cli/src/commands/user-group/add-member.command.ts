import type { UserGroupMemberBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { USER_GROUPS_ADD_MEMBER_CONTRACT } from "../user-group.contract.generated";
import { formatUserIds } from "./_shared/format-user-ids";

/** `nexus user-group add-member` */
export function registerUserGroupAddMemberCommand(userGroup: Command, program: Command): void {
  const addMember = userGroup
    .command("add-member")
    .description("Add one user to a group")
    .argument("<id>", "User group UUID")
    .requiredOption("--user-id <id>", "Clerk user ID (user_…)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus user-group add-member 11111111-1111-4111-8111-111111111111 --user-id user_abc

Notes:
  ONE USER PER CALL. There is no comma-separated form here — "user-group create"
  takes --user-ids to seed a membership, this verb does not.
  TWO ID SPACES, AND MIXING THEM IS THE COMMON MISTAKE. The argument is the
  group's UUID; --user-id is a Clerk user id and starts with "user_".
  It answers with the WHOLE group — id, name, member count and every member id —
  so the result is the read-back and no separate get is needed.
  --user-id may instead be supplied inside --body as "userId".`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, { userId: opts.userId });
        const { userGroup: group } = await client.userGroups.addMember(
          id,
          asRequestBody<UserGroupMemberBody>(body)
        );
        printRecord(group, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "memberCount", label: "Members" },
          { key: "memberUserIds", label: "Member IDs", format: formatUserIds }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(addMember, USER_GROUPS_ADD_MEMBER_CONTRACT);
}
