import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList, printWarning } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role scope-lines` */
export function registerRoleScopeLinesCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("scope-lines")
    .description("List a Role's scope lines — the job model's per-Role work items")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role scope-lines "Support agent"

Notes:
  UNRESOLVED VARIABLES is not decoration. A non-empty list means these lines'
  job types reference variables this Role does not define, so the lines are
  priced from an incomplete model. Define them with "nexus role set-variables".`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.listScopeLines(await resolveRoleId(client, ref));

        printList(result.lines, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "jobTypeId", label: "JOB TYPE", width: 36 },
          { key: "quantity", label: "QTY", width: 8 },
          { key: "scope", label: "SCOPE", width: 40 }
        ]);
        if (result.unresolvedVariables.length > 0) {
          printWarning(
            `${String(result.unresolvedVariables.length)} variable(s) referenced by these lines are NOT defined on this Role.`,
            `Keys: ${result.unresolvedVariables.join(", ")}`,
            "Any part referencing one of these has no value, so the lines depending on it are",
            'priced from an incomplete model. Define them with "nexus role set-variables".'
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
