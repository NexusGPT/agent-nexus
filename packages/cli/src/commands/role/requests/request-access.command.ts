import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import {
  ROLE_ACCESS_REQUESTS_CREATE__BODY_RESOURCE_TYPE,
  ROLE_ACCESS_REQUESTS_CREATE_CONTRACT
} from "../../role.contract.generated";
import { resolveRoleId } from "../_shared/resolve-role-id";
import { isRoleResourceType, RESOURCE_TYPE_NAMES } from "../_shared/role-kinds";

/** `nexus role request-access` */
export function registerRoleRequestAccessCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("request-access")
    .description("Ask for access to one of a Role's systems")
    .argument("<role>", "Role name or UUID")
    .addOption(
      enumOption(
        "--type <type>",
        "Kind of system",
        ROLE_ACCESS_REQUESTS_CREATE__BODY_RESOURCE_TYPE
      ).makeOptionMandatory()
    )
    .requiredOption("--id <id>", "The system's UUID")
    .option("--note <text>", "Why you need it, up to 2000 characters")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role request-access "Support" --type agent --id 11111111-1111-4111-8111-111111111111 --note "on call"

Notes:
  Files a PENDING request. Someone with the review permission then decides it
  with "nexus role review-access".`
    )
    .action(async (ref: string, opts: { type: string; id: string; note?: string }) => {
      try {
        if (!isRoleResourceType(opts.type)) {
          throw new Error(
            `Invalid --type "${opts.type}". Expected one of: ${RESOURCE_TYPE_NAMES}.`
          );
        }
        const client = createClient(program.optsWithGlobals());
        const { request } = await client.roles.createAccessRequest(
          await resolveRoleId(client, ref),
          { resourceType: opts.type, resourceId: opts.id, note: opts.note ?? null }
        );

        printSuccess("Access requested.", { id: request.id, status: request.status });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLE_ACCESS_REQUESTS_CREATE_CONTRACT);
  return leaf;
}
