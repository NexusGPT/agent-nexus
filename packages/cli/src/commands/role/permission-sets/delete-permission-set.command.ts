import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role delete-permission-set` */
export function registerRoleDeletePermissionSetCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("delete-permission-set")
    .description("Delete a permission set")
    .argument("<role>", "Role name or UUID")
    .argument("<permission-set-id>", "Permission-set UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role delete-permission-set "Support" 22222222-2222-4222-8222-222222222222

Notes:
  A SYSTEM set cannot be deleted — the product seeds both templates and refuses
  to let them go. Idempotent: removed=false when the row was already gone.`
    )
    .action(async (ref: string, permissionSetId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.deletePermissionSet(
          await resolveRoleId(client, ref),
          permissionSetId
        );

        printSuccess(result.removed ? "Permission set deleted." : "No such permission set.", {
          removed: result.removed
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
