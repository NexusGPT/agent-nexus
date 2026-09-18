import type { UpdateRolePermissionSetBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumInCompositeOption, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";
import { parseIdList } from "../../../util/ids";
import {
  ROLES_UPDATE_PERMISSION_SET__BODY_CAPABILITIES_ITEM,
  ROLES_UPDATE_PERMISSION_SET__BODY_RESOURCE_RELATION,
  ROLES_UPDATE_PERMISSION_SET_CONTRACT
} from "../../role.contract.generated";
import { readNullableString } from "../_shared/read-nullable-string";
import { resolveRoleId } from "../_shared/resolve-role-id";
import { warnIfReachesNothing } from "../_shared/warn-if-reaches-nothing";

/** `nexus role update-permission-set` */
export function registerRoleUpdatePermissionSetCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("update-permission-set")
    .description("Change a permission set")
    .argument("<role>", "Role name or UUID")
    .argument("<permission-set-id>", "Permission-set UUID")
    .option("--name <name>", "New display name")
    .option("--surfaces <list>", 'REPLACES the surface list. Comma-separated, or "*"')
    .addOption(
      enumOption(
        "--relation <relation>",
        "Relation the set grants",
        ROLES_UPDATE_PERMISSION_SET__BODY_RESOURCE_RELATION,
        {
          alsoAccepts: ["none"],
          because:
            "'none' is this CLI's own token for a capability-only set; the wire value is null"
        }
      )
    )
    .addOption(
      enumInCompositeOption(
        "--capabilities <list>",
        "REPLACES the capability list. Comma-separated",
        ROLES_UPDATE_PERMISSION_SET__BODY_CAPABILITIES_ITEM,
        "each item"
      )
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role update-permission-set "Support" 22222222-2222-4222-8222-222222222222 --surfaces inbox

Notes:
  --capabilities and --surfaces REPLACE their lists rather than merging, so
  sending a subset removes the rest. At least one field is required.
  A SYSTEM set's definition is immutable in the product — only its membership
  can change — so this is refused on one.`
    )
    .action(async (ref: string, permissionSetId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          surfaces: opts.surfaces === undefined ? undefined : parseIdList(String(opts.surfaces)),
          resourceRelation:
            opts.relation === undefined ? undefined : readNullableString(String(opts.relation)),
          capabilities:
            opts.capabilities === undefined ? undefined : parseIdList(String(opts.capabilities))
        });
        const result = await client.roles.updatePermissionSet(
          roleId,
          permissionSetId,
          asRequestBody<UpdateRolePermissionSetBody>(body)
        );

        printSuccess("Permission set updated.", {
          id: result.permissionSet.id,
          resourceReach: result.resourceReach
        });
        warnIfReachesNothing(result.resourceReach);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_UPDATE_PERMISSION_SET_CONTRACT);
  return leaf;
}
