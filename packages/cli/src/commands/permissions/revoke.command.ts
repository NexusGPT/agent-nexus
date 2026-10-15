import type { RevokePermissionBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { parseIdList } from "../../util/ids";
import {
  PERMISSIONS_REVOKE__BODY_RESOURCE_TYPE,
  PERMISSIONS_REVOKE__BODY_SUBJECT_TYPE,
  PERMISSIONS_REVOKE_CONTRACT
} from "../permissions.contract.generated";

const REVOKE_HELP = `
Examples:
  $ nexus permissions revoke --resource-type agent --resource-id 1111... \\
      --subject-type user --subject-id user_abc

Notes:
  Cascade IDs are intersected with the real downstream set server-side, so
  naming an unrelated subject removes nothing.

  ASSERT ON revokedCount, NOT ON success. --json prints
  {success, message, revokedCount}, and success only reports that the request
  was accepted. A revoke that matched no grant — a subject that never held one,
  a cascade id the intersection above discarded — is a SUCCESS carrying
  revokedCount 0. That is the only field that says whether anything was
  removed, and it is the number to compare against what you meant to revoke.`;

/** `nexus permissions revoke` */
export function registerPermissionsRevokeCommand(permissions: Command, program: Command): void {
  const revoke = permissions
    .command("revoke")
    .description("Revoke a principal's grant on a resource")
    .addOption(
      enumOption(
        "--resource-type <type>",
        "Resource type",
        PERMISSIONS_REVOKE__BODY_RESOURCE_TYPE
      ).makeOptionMandatory()
    )
    .requiredOption("--resource-id <id>", "Resource UUID, or '*' to target a wildcard grant")
    .addOption(
      enumOption(
        "--subject-type <type>",
        "Subject type",
        PERMISSIONS_REVOKE__BODY_SUBJECT_TYPE
      ).makeOptionMandatory()
    )
    .requiredOption("--subject-id <id>", "Subject ID")
    .option("--cascade-subject-ids <ids>", "Comma-separated subject IDs delegated from this grant")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", REVOKE_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const cascadeSubjectIds =
          opts.cascadeSubjectIds !== undefined
            ? parseIdList(String(opts.cascadeSubjectIds))
            : undefined;
        const body = mergeBodyWithFlags(base, {
          resourceType: opts.resourceType,
          resourceId: opts.resourceId,
          subjectType: opts.subjectType,
          subjectId: opts.subjectId,
          cascadeSubjectIds
        });
        const result = await client.permissions.revoke(asRequestBody<RevokePermissionBody>(body));
        printSuccess("Permission revoked.", { revokedCount: result.revokedCount });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(revoke, PERMISSIONS_REVOKE_CONTRACT);
}
