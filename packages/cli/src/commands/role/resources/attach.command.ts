import type { AttachRoleSystemBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { asRequestBody } from "../../../util/body";
import {
  ROLES_ATTACH_RESOURCE__BODY_RESOURCE_TYPE,
  ROLES_ATTACH_RESOURCE_CONTRACT
} from "../../role.contract.generated";
import { resolveRoleId } from "../_shared/resolve-role-id";
import { isRoleResourceType, RESOURCE_TYPE_NAMES } from "../_shared/role-kinds";
import { renderRoleAttach, type RoleAttachOptions } from "./attach.render";

/** `nexus role attach` */
export function registerRoleAttachCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("attach")
    .description("Put a system in a Role — THIS MOVES IT off whatever Role held it")
    .argument("<role>", "Role name or UUID — the Role that will hold the system")
    .addOption(
      enumOption(
        "--type <type>",
        "Kind of system",
        ROLES_ATTACH_RESOURCE__BODY_RESOURCE_TYPE
      ).makeOptionMandatory()
    )
    .requiredOption("--id <id>", "The system's UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role attach "Support agent" --type agent --id 11111111-1111-4111-8111-111111111111

Notes:
  THIS IS A MOVE, NOT AN ADD. A system belongs to exactly ONE Role, so this
  revokes the previous Role's claim AND the access its members had through it.
  There is no sharing — reuse is a clone or a move.

  This command prints a warning naming the Role the system came from — its NAME
  and its UUID, because a name matching two Roles is refused as an argument. That
  warning is the only signal anyone gets that another team just lost it, and it
  goes to STDERR: under --json the machine-readable answer is "movedFrom", which
  stays a bare UUID.
  A name needs the roles:read scope. Without it the warning still prints, with
  the UUID alone.

  The system must already exist in this organization, or it is a 404.

  --type IS NOT "permissions grant --resource-type", AND THE OVERLAP IS WHAT
  MAKES THEM READ AS ONE ENUM. Exactly three spellings are common to both —
  agent, workflow, deployment. ai_task and document_template exist only here;
  knowledge, credential, access_card, template, document, feature, vibe_app and
  workspace exist only there. A value from one list is refused by the other.
  The two are also different acts: this one is EXCLUSIVE ownership, one Role
  per system org-wide, while a grant is a relation any number of principals may
  hold at once.

  KNOWLEDGE COLLECTIONS, FILE WORKSPACES AND EXTERNAL TOOLS ARE NOT ATTACHABLE
  HERE, and that follows from the same rule: several Roles legitimately hold the
  same one, which exclusive ownership cannot express. Each has its own grant
  instead — "nexus role grant-collection" and "nexus role grant-workspace". An
  external tool's grant has no verb in this CLI.`
    )
    .action(async (ref: string, opts: RoleAttachOptions) => {
      try {
        if (!isRoleResourceType(opts.type)) {
          throw new Error(
            `Invalid --type "${opts.type}". Expected one of: ${RESOURCE_TYPE_NAMES}. ` +
              `A Role holds operational systems — knowledge, credential and workspace belong to the permissions surface, not here.`
          );
        }
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const result = await client.roles.attachSystem(
          roleId,
          asRequestBody<AttachRoleSystemBody>({ resourceType: opts.type, resourceId: opts.id })
        );

        await renderRoleAttach(client, roleId, opts, result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_ATTACH_RESOURCE_CONTRACT);
  return leaf;
}
