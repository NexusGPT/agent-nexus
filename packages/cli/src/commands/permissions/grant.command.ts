import type { GrantPermissionBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import {
  PERMISSIONS_GRANT__BODY_RELATION,
  PERMISSIONS_GRANT__BODY_RESOURCE_TYPE,
  PERMISSIONS_GRANT__BODY_SUBJECT_TYPE,
  PERMISSIONS_GRANT_CONTRACT
} from "../permissions.contract.generated";

const GRANT_HELP = `
Examples:
  $ nexus permissions grant --resource-type agent --resource-id 1111... \\
      --subject-type group --subject-id 2222... --relation viewer

Notes:
  YOU CANNOT GRANT ON A RESOURCE YOU HAVE NO RELATION ON. This is delegation,
  not administration, so an organization admin is refused exactly like anyone
  else — with a 403 that names the relation you hold, or states you hold none.
  That message is about YOUR standing, never about --subject-id. See the
  namespace help.

  A WILDCARD GRANT ('*' as the resource id) IS ADMIN-ONLY, and is the one
  operation here that does turn on your organization role.`;

/** `nexus permissions grant` */
export function registerPermissionsGrantCommand(permissions: Command, program: Command): void {
  const grant = permissions
    .command("grant")
    .description("Grant a principal a relation on a resource")
    .addOption(
      enumOption(
        "--resource-type <type>",
        "Resource type",
        PERMISSIONS_GRANT__BODY_RESOURCE_TYPE
      ).makeOptionMandatory()
    )
    .requiredOption("--resource-id <id>", "Resource UUID")
    .addOption(
      enumOption(
        "--subject-type <type>",
        "Subject type",
        PERMISSIONS_GRANT__BODY_SUBJECT_TYPE
      ).makeOptionMandatory()
    )
    .requiredOption("--subject-id <id>", "Subject ID — user id, group UUID, org id, or API key id")
    .addOption(
      enumOption(
        "--relation <relation>",
        "Relation to grant",
        PERMISSIONS_GRANT__BODY_RELATION
      ).makeOptionMandatory()
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", GRANT_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          resourceType: opts.resourceType,
          resourceId: opts.resourceId,
          subjectType: opts.subjectType,
          subjectId: opts.subjectId,
          relation: opts.relation
        });
        const grant = await client.permissions.grant(asRequestBody<GrantPermissionBody>(body));
        printSuccess("Permission granted.", { id: grant.id, createdAt: grant.createdAt });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(grant, PERMISSIONS_GRANT_CONTRACT);
}
