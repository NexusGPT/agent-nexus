import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role workspace-grants` */
export function registerRoleWorkspaceGrantsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("workspace-grants")
    .description("List the file workspaces a Role reaches")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role workspace-grants "Support agent"

Notes:
  The same many-to-many exception as a collection grant — a workspace can be
  shared across several Roles.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { grants } = await client.roles.listWorkspaceGrants(await resolveRoleId(client, ref));

        printList(grants, undefined, [
          { key: "id", label: "GRANT ID", width: 36 },
          { key: "workspaceId", label: "WORKSPACE", width: 36 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
