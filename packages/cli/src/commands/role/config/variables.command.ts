import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role variables` */
export function registerRoleVariablesCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("variables")
    .description("List a Role's variables — the values its job-type parts reference")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role variables "Support agent"

Notes:
  A blank VALUE means UNSET, never zero. Any part referencing an unset variable
  is unresolved and its scope line is priced from an incomplete model.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { variables } = await client.roles.listVariables(await resolveRoleId(client, ref));

        printList(variables, undefined, [
          { key: "key", label: "KEY", width: 24 },
          { key: "label", label: "LABEL", width: 26 },
          {
            key: "value",
            label: "VALUE",
            width: 14,
            format: (val) => (val === null ? "(unset)" : String(val))
          },
          { key: "unit", label: "UNIT", width: 14 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
