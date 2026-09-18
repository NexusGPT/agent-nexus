import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role add-permission-set-member` */
export function registerRoleAddPermissionSetMemberCommand(
  role: Command,
  program: Command
): Command {
  const leaf = role
    .command("add-permission-set-member")
    .description("Put a user into one of a Role's permission sets")
    .argument("<role>", "Role name or UUID")
    .argument("<permission-set-id>", "Permission-set UUID")
    .argument("<user-id>", "Clerk user id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role add-permission-set-member "Support agent" 22222222-2222-4222-8222-222222222222 user_abc

Notes:
  THE USER MUST ALREADY BE IN THE ROLE — its owner, or seated by
  "nexus role add-member". A permission set is a SUBSET of the Role's team, so a
  user outside it is refused as "not found", the same answer a permission-set id
  that exists nowhere gets. Add the standing first, then the set.

  IT IS THE SET, NOT THE TIER, THAT CARRIES THE CAPABILITIES. "add-member"
  decides ADMIN or MEMBER; this decides which capabilities that person actually
  holds on the Role.

  Idempotent: added=false means that person was already in the set. Read the
  added line, not the exit status — both answer the same way.

  A SET THAT SHIPS WITH NEXUS ACCEPTS MEMBERS. Unlike
  "nexus role update-permission-set", which refuses a system set, seating
  somebody in Maintainers or Members is exactly what those templates are for.`
    )
    .action(async (ref: string, permissionSetId: string, userId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.addPermissionSetMember(
          await resolveRoleId(client, ref),
          permissionSetId,
          { userId }
        );

        printSuccess(result.added ? "Member seated in the set." : "Already in the set.", {
          added: result.added
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
