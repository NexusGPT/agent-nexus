import type { CreateRolePermissionSetBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumInCompositeOption, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";
import { parseIdList } from "../../../util/ids";
import {
  ROLES_CREATE_PERMISSION_SET__BODY_CAPABILITIES_ITEM,
  ROLES_CREATE_PERMISSION_SET__BODY_RESOURCE_RELATION,
  ROLES_CREATE_PERMISSION_SET_CONTRACT
} from "../../role.contract.generated";
import { readNullableString } from "../_shared/read-nullable-string";
import { resolveRoleId } from "../_shared/resolve-role-id";
import { warnIfReachesNothing } from "../_shared/warn-if-reaches-nothing";

/** `nexus role create-permission-set` */
export function registerRoleCreatePermissionSetCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("create-permission-set")
    .description("Create a permission set on a Role")
    .argument("<role>", "Role name or UUID")
    .requiredOption("--name <name>", "Display name")
    .requiredOption("--surfaces <list>", 'Comma-separated surfaces, or "*" for every surface')
    .addOption(
      enumOption(
        "--relation <relation>",
        "Relation the set grants",
        ROLES_CREATE_PERMISSION_SET__BODY_RESOURCE_RELATION,
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
        "Comma-separated capabilities, e.g. role.view,team.view",
        ROLES_CREATE_PERMISSION_SET__BODY_CAPABILITIES_ITEM,
        "each item"
      )
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role create-permission-set "Support" --name Reviewers \\
      --surfaces inbox,agents --relation viewer
  $ nexus role create-permission-set "Support" --name Auditors \\
      --surfaces '*' --relation none --capabilities role.view,team.view

Notes:
  SURFACES IS AN ALLOW-LIST, NOT A FILTER. A --relation with an empty surfaces
  list reaches NOTHING and the server refuses that pair. Pass '*' for every
  surface, name the surfaces you mean, or --relation none for a set that grants
  capabilities and no resource access.
  Read RESOURCE REACH in the output rather than re-deriving it from the two
  fields — the server computes what the set actually reaches.`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          surfaces: parseIdList(String(opts.surfaces)),
          resourceRelation:
            opts.relation === undefined ? undefined : readNullableString(String(opts.relation)),
          capabilities:
            opts.capabilities === undefined ? undefined : parseIdList(String(opts.capabilities))
        });
        const result = await client.roles.createPermissionSet(
          roleId,
          asRequestBody<CreateRolePermissionSetBody>(body)
        );

        printSuccess("Permission set created.", {
          id: result.permissionSet.id,
          name: result.permissionSet.name,
          resourceReach: result.resourceReach
        });
        warnIfReachesNothing(result.resourceReach);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_CREATE_PERMISSION_SET_CONTRACT);
  return leaf;
}
