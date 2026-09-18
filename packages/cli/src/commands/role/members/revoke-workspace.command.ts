import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role revoke-workspace` */
export function registerRoleRevokeWorkspaceCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("revoke-workspace")
    .description("Remove a Role's access to a file workspace")
    .argument("<role>", "Role name or UUID")
    .argument("<grant-id>", "The GRANT row's UUID — not the workspace's")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role revoke-workspace "Support agent" 55555555-5555-4555-8555-555555555555

Notes:
  Takes the GRANT id, which "nexus role workspace-grants" prints first.
  Idempotent: removed=false for a grant that was already gone.`
    )
    .action(async (ref: string, grantId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.revokeWorkspace(
          await resolveRoleId(client, ref),
          grantId
        );

        printSuccess(
          result.removed
            ? "Workspace revoked."
            : 'No such grant. Nothing was removed. The id must be the GRANT row\'s, which "nexus role workspace-grants" prints in the first column — a WORKSPACE id matches nothing here.',
          { removed: result.removed }
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
