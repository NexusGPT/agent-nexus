import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";
import { warnIfPermissionSetsMayBePending } from "../_shared/warn-if-permission-sets-may-be-pending";

/** `nexus role permission-sets` */
export function registerRolePermissionSetsCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("permission-sets")
    .description("List a Role's permission sets — its named capability bundles")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role permission-sets "Support agent"

Notes:
  NOT the "Group access" tab, which is a different thing entirely (a user group
  reaching one surface of the Role) and is not on this API.
  SURFACES is a strict allow-list: an empty list reaches NOTHING, and "*"
  reaches everything. Never read empty as unrestricted.
  RELATION is blank for a capability-only set — that is a chosen state.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { permissionSets } = await client.roles.listPermissionSets(
          await resolveRoleId(client, ref)
        );

        printList(permissionSets, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 22 },
          { key: "isSystem", label: "SYSTEM", width: 7 },
          { key: "resourceRelation", label: "RELATION", width: 9 },
          {
            key: "surfaces",
            label: "SURFACES",
            width: 26,
            format: (val) => (Array.isArray(val) && val.length > 0 ? val.join(",") : "(none)")
          },
          {
            key: "capabilities",
            label: "CAPS",
            width: 5,
            format: (val) => (Array.isArray(val) ? String(val.length) : "0")
          },
          { key: "memberCount", label: "MEMBERS", width: 8 }
        ]);
        warnIfPermissionSetsMayBePending(permissionSets.length);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
