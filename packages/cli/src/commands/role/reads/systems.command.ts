import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role systems` */
export function registerRoleSystemsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("systems")
    .description(
      "List the systems a Role holds — agents, workflows, deployments, AI tasks, templates"
    )
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role systems "Support agent"

Notes:
  Each system belongs to exactly ONE Role. An empty list is not a tidy state:
  a system in no Role reaches nothing at runtime and reports no error.
  Needs role_resources:read, which is separate from roles:read on purpose.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { resources } = await client.roles.listSystems(await resolveRoleId(client, ref));

        printList(resources, undefined, [
          { key: "resourceType", label: "TYPE", width: 20 },
          { key: "resourceId", label: "ID", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
