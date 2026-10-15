import type { UserGroupMemberBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { USER_GROUPS_REMOVE_MEMBER_CONTRACT } from "../user-group.contract.generated";
import { formatUserIds } from "./_shared/format-user-ids";

/** `nexus user-group remove-member` */
export function registerUserGroupRemoveMemberCommand(userGroup: Command, program: Command): void {
  const removeMember = userGroup
    .command("remove-member")
    .description("Remove one user from a group")
    .argument("<id>", "User group UUID")
    .requiredOption("--user-id <id>", "Clerk user ID (user_…)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus user-group remove-member 11111111-1111-4111-8111-111111111111 --user-id user_abc

Notes:
  THIS REMOVES A MEMBERSHIP, NOT A USER. The person keeps their account and every
  other group; only this group's grants stop applying to them.
  ONE USER PER CALL, and the argument is the group's UUID while --user-id is a
  Clerk user id starting with "user_".
  It answers with the WHOLE group — id, name, member count and every remaining
  member id — so the result is the read-back.
  --user-id may instead be supplied inside --body as "userId".`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, { userId: opts.userId });
        const { userGroup: group } = await client.userGroups.removeMember(
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
  bindCommand(removeMember, USER_GROUPS_REMOVE_MEMBER_CONTRACT);
}
