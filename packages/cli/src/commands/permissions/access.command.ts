import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumArgument } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope, printList } from "../../output";
import {
  PERMISSIONS_LIST_RESOURCE_ACCESS__PATH_VARS_RESOURCE_TYPE,
  PERMISSIONS_LIST_RESOURCE_ACCESS_CONTRACT
} from "../permissions.contract.generated";
import { isGenericGrantResourceType, RESOURCE_TYPE_NAMES } from "./_shared/resource-types";
import { describeUnlistedReach } from "./_shared/unlisted-reach";

const ACCESS_HELP = `
Examples:
  $ nexus permissions access agent 11111111-1111-4111-8111-111111111111
  $ nexus permissions access workflow 22222222-2222-4222-8222-222222222222 --json

Notes:
  AN EMPTY LIST IS NOT AN ANSWER ON ITS OWN — READ THE "Reach:" LINE UNDER IT.
  A grant row names a resource, and two things reach a resource without naming
  it: an open resource type, which reaches it through no row at all, and a
  wildcard grant, whose row names the TYPE. Both leave the table empty. The
  reach line is the only thing that separates them from "nobody", and under
  --json it is the "unlistedReach" field.

  A RESOURCE CREATED THROUGH THE DASHBOARD ALREADY HAS TWO GRANTS NOBODY WROTE —
  an organization-wide editor grant and an owner grant for its creator, both
  dated at creation. One created by an API key has NEITHER, because the key is
  its own subject and owns nothing by default. So the baseline is two rows or
  none depending on who created it; the reach line tells you which world you
  are in without having to know.

  IT REFUSES FOR A RESOURCE THAT IS CLOSED TO YOU, org admin or not, and the 403
  names the relation it wanted. An id that is not in your organization answers
  404 — the same 404 as an id that exists nowhere, so it discloses nothing.`;

/** `nexus permissions access` */
export function registerPermissionsAccessCommand(permissions: Command, program: Command): void {
  const access = permissions
    .command("access")
    .description("List every grant written against one resource")
    // The values come from the contract and commander enforces them on the
    // POSITIONAL, so a wrong type is refused here rather than becoming a 400 on
    // a path segment that reads as a bad id. NO NORMALISER: the v1 schema is a
    // bare `z.enum` and refuses `AGENT`, so case-folding would make this CLI
    // accept a spelling the server rejects.
    .addArgument(
      enumArgument(
        "<resource-type>",
        "Resource type",
        PERMISSIONS_LIST_RESOURCE_ACCESS__PATH_VARS_RESOURCE_TYPE
      )
    )
    .argument("<resource-id>", "Resource UUID")
    .addHelpText("after", ACCESS_HELP)
    .action(async (resourceType: string, resourceId: string) => {
      try {
        if (!isGenericGrantResourceType(resourceType)) {
          throw new Error(
            `Invalid resource type "${resourceType}". Expected one of: ${RESOURCE_TYPE_NAMES}.`
          );
        }
        const client = createClient(program.optsWithGlobals());
        const result = await client.permissions.listResourceAccess(resourceType, resourceId);

        // ONE document under --json, carrying BOTH halves. Printing the rows
        // through `printList` and the reach beside it would narrow the response
        // to `permissions` before anything knew which channel it was writing —
        // and `unlistedReach` is the field that says what those rows OMIT, so a
        // script would read an under-count as the whole answer.
        printEnvelope(result, () => {
          printList(result.permissions, undefined, [
            { key: "subjectType", label: "SUBJECT TYPE", width: 14 },
            { key: "subjectId", label: "SUBJECT ID", width: 36 },
            { key: "relation", label: "RELATION", width: 10 },
            { key: "createdAt", label: "CREATED", width: 20 }
          ]);
          console.log(describeUnlistedReach(result.unlistedReach));
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(access, PERMISSIONS_LIST_RESOURCE_ACCESS_CONTRACT);
}
