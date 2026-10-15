import type { UpdateUserGroupBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { parseIdList } from "../../util/ids";
import { USER_GROUPS_UPDATE_CONTRACT } from "../user-group.contract.generated";

/** `nexus user-group update` */
export function registerUserGroupUpdateCommand(userGroup: Command, program: Command): void {
  const update = userGroup
    .command("update")
    .description("Rename a group, and optionally replace its membership")
    .argument("<id>", "User group UUID")
    .requiredOption("--name <name>", "Group name")
    .option("--user-ids <ids>", "Comma-separated Clerk user IDs — REPLACES the membership")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus user-group update 11111111-1111-4111-8111-111111111111 --name "Support EMEA"
  $ nexus user-group update 11111111-1111-4111-8111-111111111111 --name "Support" --user-ids user_abc

Notes:
  --user-ids REPLACES the membership. Passing an empty value empties the
  group; omitting the flag leaves the membership alone.
  YOU CANNOT CHANGE MEMBERSHIP WITHOUT ALSO SENDING A NAME. A name is required
  on every update, so a membership-only edit is not expressible — and sending a
  name you guessed RENAMES the group as a side effect. Read the current name out
  of "user-group list" — the namespace has no "get" — and pass it back unchanged:

    $ nexus user-group update 11111111-1111-4111-8111-111111111111 --user-ids user_abc \\
        --name "$(nexus user-group list --json | jq -r '.data[] | select(.id=="11111111-1111-4111-8111-111111111111") | .name')"

  A USER WHO IS NOT IN THIS ORGANIZATION IS REFUSED, and the refusal counts the
  bad ids without naming them. Passing ten ids to find the one that fails means
  bisecting by hand — verify the ids before you send a long list.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          userIds: opts.userIds !== undefined ? parseIdList(String(opts.userIds)) : undefined
        });
        const { userGroup: updated } = await client.userGroups.update(
          id,
          asRequestBody<UpdateUserGroupBody>(body)
        );
        printSuccess("User group updated.", {
          id: updated.id,
          name: updated.name,
          memberCount: updated.memberCount
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(update, USER_GROUPS_UPDATE_CONTRACT);
}
