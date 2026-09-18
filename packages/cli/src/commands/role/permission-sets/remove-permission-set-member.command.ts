import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role remove-permission-set-member` */
export function registerRoleRemovePermissionSetMemberCommand(
  role: Command,
  program: Command
): Command {
  const leaf = role
    .command("remove-permission-set-member")
    .description("Take a user out of one of a Role's permission sets")
    .argument("<role>", "Role name or UUID")
    .argument("<permission-set-id>", "Permission-set UUID")
    .argument("<user-id>", "Clerk user id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role remove-permission-set-member "Support agent" 22222222-2222-4222-8222-222222222222 user_abc

Notes:
  THIS IS THE NARROW REVOCATION. "nexus role delete-permission-set" is NOT a
  substitute — destroying the set takes its capabilities from everybody else in
  it too.

  IT DOES NOT TOUCH THE ROLE. The user keeps their ADMIN or MEMBER standing and
  every other set they are in. "nexus role remove-member" is what ends the
  standing, and it purges permission-set rows on its way out.

  Idempotent, and THE THREE ABSENCES ANSWER ALIKE: no such permission set, a set
  belonging to another Role, and a user who was never in it all report
  removed=false. So removed=false is not proof the id was right — read the set
  back with "nexus role permission-sets" if you need to know which it was.`
    )
    .action(async (ref: string, permissionSetId: string, userId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.removePermissionSetMember(
          await resolveRoleId(client, ref),
          permissionSetId,
          userId
        );

        printSuccess(
          result.removed ? "Member removed from the set." : "That user was not in the set.",
          { removed: result.removed }
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
