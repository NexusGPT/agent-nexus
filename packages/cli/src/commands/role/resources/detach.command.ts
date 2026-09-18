import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumArgument } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { absent, printSuccess, printWarning } from "../../../output";
import {
  ROLES_DETACH_RESOURCE__PATH_VARS_RESOURCE_TYPE,
  ROLES_DETACH_RESOURCE_CONTRACT
} from "../../role.contract.generated";
import { isRoleResourceType, RESOURCE_TYPE_NAMES } from "../_shared/role-kinds";

/** `nexus role detach` */
export function registerRoleDetachCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("detach")
    .description("Take a system out of whichever Role holds it — this DISABLES its access")
    // The values come from the contract and commander enforces them on the
    // POSITIONAL. NO NORMALISER: the v1 path-var schema is a bare `z.enum` and
    // refuses `AGENT`, so case-folding here would accept a spelling the server
    // rejects — an undeclared widening.
    .addArgument(
      enumArgument("<type>", "Kind of system", ROLES_DETACH_RESOURCE__PATH_VARS_RESOURCE_TYPE)
    )
    .argument("<id>", "The system's UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role detach agent 11111111-1111-4111-8111-111111111111

Notes:
  NAMES NO ROLE, and that is not an omission: a system belongs to exactly one
  Role, so there is only one it could be leaving. The server resolves it and
  reports which.

  THE SYSTEM SURVIVES AND KEEPS RUNNING — as an orphan, reachable by nothing
  that resolves access through a Role, reporting no error. This is a disabling,
  not a tidy-up.

  Idempotent: a system already in no Role answers removed=false, not a 404.

  <type> IS THE SAME FIVE-VALUE LIST AS "role attach --type", AND IT IS NOT
  "permissions grant --resource-type" — that one is a different eleven-value
  list, and "nexus role attach --help" names what the two share and what they
  do not.`
    )
    .action(async (type: string, id: string) => {
      try {
        if (!isRoleResourceType(type)) {
          throw new Error(
            `Invalid system type "${type}". Expected one of: ${RESOURCE_TYPE_NAMES}.`
          );
        }
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.detachSystem(type, id);

        printSuccess(result.removed ? "System detached." : "Nothing to detach.", {
          removed: result.removed,
          removedFromRole: result.removedFromRoleId ?? absent("(it belonged to no Role)")
        });

        if (result.removed) {
          printWarning(
            "That system is now in NO Role.",
            "It still exists and still runs, and it is reachable by nothing that resolves",
            "access through a Role. No error will be reported anywhere."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_DETACH_RESOURCE_CONTRACT);
  return leaf;
}
