import type { CreateUserGroupBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { parseIdList } from "../../util/ids";
import { USER_GROUPS_CREATE_CONTRACT } from "../user-group.contract.generated";

/** `nexus user-group create` */
export function registerUserGroupCreateCommand(userGroup: Command, program: Command): void {
  const create = userGroup
    .command("create")
    .description("Create a user group")
    .requiredOption("--name <name>", "Group name")
    .option("--user-ids <ids>", "Comma-separated Clerk user IDs to seed the membership")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus user-group create --name "Support"
  $ nexus user-group create --name "Support" --user-ids user_abc,user_def

Notes:
  EVERY SEED ID MUST ALREADY BE A MEMBER OF THIS ORGANIZATION. An id that is not
  fails the whole create — no group is made — and the error counts the bad ids
  rather than naming them, so a long list has to be bisected by hand. Seed with
  a short list, or create empty and add members one at a time.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          userIds: opts.userIds !== undefined ? parseIdList(String(opts.userIds)) : undefined
        });
        const { userGroup: created } = await client.userGroups.create(
          asRequestBody<CreateUserGroupBody>(body)
        );
        printSuccess("User group created.", {
          id: created.id,
          name: created.name,
          memberCount: created.memberCount
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(create, USER_GROUPS_CREATE_CONTRACT);
}
