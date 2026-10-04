import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role remove-member` */
export function registerRoleRemoveMemberCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("remove-member")
    .description("Remove a user's ADMIN or MEMBER standing in a Role")
    .argument("<role>", "Role name or UUID")
    .argument("<user-id>", "Clerk user id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role remove-member "Support agent" user_abc

Notes:
  removed=true means the user was a member: a seat in the Role's maintainer or
  member permission set went. Idempotent: removed=false for a user who held no
  such seat.

  IT DOES NOT TOUCH OWNERSHIP. Ownership is not a membership, so asking this to
  remove the OWNER is a no-op that deletes nothing and reports removed=false.
  Use "nexus role update --owner" to hand the Role over.

  A removed member loses every permission-set seat, custom sets included, which
  no foreign key would do. A user seated only in custom permission sets is not
  a member: removed=false, and those seats stay. Use
  "nexus role remove-permission-set-member" for them.`
    )
    .action(async (ref: string, userId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.removeMember(await resolveRoleId(client, ref), userId);

        printSuccess(result.removed ? "Standing removed." : "That user held no standing.", {
          removed: result.removed
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
