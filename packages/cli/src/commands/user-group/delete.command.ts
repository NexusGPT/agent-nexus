import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { USER_GROUPS_DELETE_CONTRACT } from "../user-group.contract.generated";

/**
 * `nexus user-group delete`
 *
 * `confirmable()` wraps the command AT CREATION, so `--yes` is declared before
 * `bindCommand` appends `--print-contract`. That ordering is what a reader sees
 * in `--help`, and `custom-model delete` is the one verb in this wave that does
 * it the other way round — so the order here is load-bearing, not incidental.
 */
export function registerUserGroupDeleteCommand(userGroup: Command, program: Command): void {
  const remove = confirmable(userGroup.command("delete"))
    .description("Delete a group and every permission grant that named it")
    .argument("<id>", "User group UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus user-group delete 11111111-1111-4111-8111-111111111111 --yes

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
  bindCommand(remove, USER_GROUPS_DELETE_CONTRACT);
}
