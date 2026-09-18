import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role grant-workspace` */
export function registerRoleGrantWorkspaceCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("grant-workspace")
    .description("Give a Role access to a file workspace")
    .argument("<role>", "Role name or UUID")
    .argument("<workspace-id>", "Workspace UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role grant-workspace "Support agent" 44444444-4444-4444-8444-444444444444

Notes:
  Idempotent, and the same many-to-many exception as a collection grant.`
    )
    .action(async (ref: string, workspaceId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { grant } = await client.roles.grantWorkspace(await resolveRoleId(client, ref), {
          workspaceId
        });

        printSuccess("Workspace granted.", { grantId: grant.id, workspaceId: grant.workspaceId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
