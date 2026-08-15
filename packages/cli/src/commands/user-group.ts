import type {
  CreateUserGroupBody,
  UpdateUserGroupBody,
  UserGroupMemberBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { parseIdList } from "../util/ids";
import {
  USER_GROUPS_ADD_MEMBER_CONTRACT,
  USER_GROUPS_CREATE_CONTRACT,
  USER_GROUPS_DELETE_CONTRACT,
  USER_GROUPS_LIST_CONTRACT,
  USER_GROUPS_REMOVE_MEMBER_CONTRACT,
  USER_GROUPS_UPDATE_CONTRACT
} from "./user-group.contract.generated";

export function registerUserGroupCommands(program: Command): void {
  const userGroup = program
    .command("user-group")
    .description("Manage user groups — the group principal a permission grant names");

  // ── list ──────────────────────────────────────────────────────────────
  const list = userGroup
    .command("list")
    .description("List user groups")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus user-group list
  $ nexus user-group list --json`
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

  // ── create ────────────────────────────────────────────────────────────
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

  // ── update ────────────────────────────────────────────────────────────
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
  $ nexus user-group update 1111... --name "Support EMEA"
  $ nexus user-group update 1111... --name "Support" --user-ids user_abc

Notes:
  --user-ids REPLACES the membership. Passing an empty value empties the
  group; omitting the flag leaves the membership alone.
  YOU CANNOT CHANGE MEMBERSHIP WITHOUT ALSO SENDING A NAME. A name is required
  on every update, so a membership-only edit is not expressible — and sending a
  name you guessed RENAMES the group as a side effect. Read the current name
  with "nexus user-group get <id>" and pass it back unchanged:

    $ nexus user-group update 1111... --name "$(nexus user-group get 1111... --json | jq -r .name)" --user-ids user_abc

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

  // ── add-member ────────────────────────────────────────────────────────
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
  $ nexus user-group add-member 1111... --user-id user_abc`
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

  // ── remove-member ─────────────────────────────────────────────────────
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
  $ nexus user-group remove-member 1111... --user-id user_abc`
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

  // ── delete ────────────────────────────────────────────────────────────
  const remove = confirmable(userGroup.command("delete"))
    .description("Delete a group and every permission grant that named it")
    .argument("<id>", "User group UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus user-group delete 1111... --yes

Notes:
  The reported revoked count is how you tell a delete that cleaned up its
  grants from one that left them orphaned.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!(await confirmDestructive(`Delete user group ${id}?`, opts))) return;
        const result = await client.userGroups.delete(id);
        printSuccess("User group deleted.", {
          id,
          revokedPermissionCount: result.revokedPermissionCount
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, USER_GROUPS_LIST_CONTRACT);
  bindCommand(create, USER_GROUPS_CREATE_CONTRACT);
  bindCommand(update, USER_GROUPS_UPDATE_CONTRACT);
  bindCommand(addMember, USER_GROUPS_ADD_MEMBER_CONTRACT);
  bindCommand(removeMember, USER_GROUPS_REMOVE_MEMBER_CONTRACT);
  bindCommand(remove, USER_GROUPS_DELETE_CONTRACT);
}

/** Renders a group's `memberUserIds` array for the human-readable record output. */
function formatUserIds(value: unknown): string {
  return Array.isArray(value) && value.length > 0 ? value.join(", ") : "—";
}
