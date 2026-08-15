import type {
  GrantPermissionBody,
  PermissionResourceType,
  ResourceVisibility,
  RevokePermissionBody,
  UnlistedReach,
  UpdateResourceTypeVisibilityBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumArgument, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { isJsonMode, printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { parseIdList } from "../util/ids";
import {
  PERMISSIONS_GRANT__BODY_RELATION,
  PERMISSIONS_GRANT__BODY_RESOURCE_TYPE,
  PERMISSIONS_GRANT__BODY_SUBJECT_TYPE,
  PERMISSIONS_GRANT_CONTRACT,
  PERMISSIONS_LIST_RESOURCE_ACCESS__PATH_VARS_RESOURCE_TYPE,
  PERMISSIONS_LIST_RESOURCE_ACCESS_CONTRACT,
  PERMISSIONS_REVOKE__BODY_RESOURCE_TYPE,
  PERMISSIONS_REVOKE__BODY_SUBJECT_TYPE,
  PERMISSIONS_REVOKE_CONTRACT,
  PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY__BODY_RESOURCE_TYPE,
  PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY__BODY_VISIBILITY,
  PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY_CONTRACT
} from "./permissions.contract.generated";

/**
 * Every member of `PermissionResourceType`, as a runtime lookup.
 *
 * A `Record` over the union rather than an array: a resource type added to the
 * SDK is a COMPILE ERROR here until it is listed, where an array would silently
 * start rejecting a type the server accepts. The CLI needs the runtime list at
 * all because `nexus permissions access` takes the type as a positional
 * argument, and a `string` from commander has to be narrowed rather than cast.
 */
const PERMISSION_RESOURCE_TYPES: Record<PermissionResourceType, true> = {
  agent: true,
  workflow: true,
  knowledge: true,
  credential: true,
  access_card: true,
  template: true,
  document: true,
  deployment: true,
  feature: true,
  vibe_app: true,
  workspace: true
};

const RESOURCE_TYPE_NAMES = Object.keys(PERMISSION_RESOURCE_TYPES).sort().join(", ");

function isPermissionResourceType(value: string): value is PermissionResourceType {
  return Object.prototype.hasOwnProperty.call(PERMISSION_RESOURCE_TYPES, value);
}

/**
 * The sentence that stops an empty table being read as "nobody".
 *
 * A `Record` over the union rather than a switch: a value added to
 * `UnlistedReach` is a compile error here until it is given a sentence, where a
 * default arm would quietly print the safest-sounding one — and the safe-sounding
 * answer is exactly the wrong one, because it understates who can reach the
 * resource.
 */
const UNLISTED_REACH_SENTENCES: Record<UnlistedReach, string> = {
  organization:
    "Reach: EVERY MEMBER of the organization. No grant names this resource and its type is open, so the rows above are not the whole answer.",
  type_wide_grant:
    "Reach: also a WILDCARD grant on this resource type, which reaches every resource of the type and names none of them. It is not listed above.",
  nobody: "Reach: the grants listed above, and nothing else."
};

function describeUnlistedReach(reach: UnlistedReach): string {
  return UNLISTED_REACH_SENTENCES[reach];
}

/**
 * Resolve `--visibility` into what the API expects.
 *
 * `none` is a token this CLI invents — the wire value is `null`, which removes
 * the override so the type falls back to the org default. Omitting the field is
 * refused by the server, so "clear it" has to be sayable, and it cannot be said
 * by leaving the flag off. The check is local because a typo (`--visibility
 * non`) would otherwise be forwarded verbatim and 400 with a message listing
 * enum values that do not include `none`.
 */
function resolveVisibility(raw: string): ResourceVisibility | null {
  if (raw === "none" || raw === "null") return null;
  if (raw === "open" || raw === "closed") return raw;
  throw new Error(`Invalid --visibility "${raw}". Expected: open, closed, or none (clears it).`);
}

/** Render a resource-type → visibility map as `agent=open, workflow=closed`. */
function formatVisibilityMap(
  map: Partial<Record<PermissionResourceType, ResourceVisibility>>
): string {
  const parts = Object.entries(map).map(([type, visibility]) => `${type}=${String(visibility)}`);
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function registerPermissionsCommands(program: Command): void {
  const permissions = program
    .command("permissions")
    .description("Share resources: read access lists, grant and revoke, read org visibility");

  permissions.addHelpText(
    "after",
    `
BEING AN ORG ADMIN IS NOT ENOUGH HERE, AND THAT SURPRISES EVERYONE ONCE.
Grants are DELEGATED, not administered: what you can read and write on a
resource depends on YOUR OWN relation to that resource, not on your role in the
organization. An org admin with no relation on an agent cannot list its grants
and cannot grant on it — both answer 403.

  • READING NEEDS A RELATION *OR* AN OPEN RESOURCE. "permissions access" answers
    for any resource you can already reach — including one whose type is open
    and that nobody has been granted anything on, which used to be refused. It
    is still refused for a resource that is closed to you, and answers 404 for
    an id outside your organization.
  • GRANTING NEEDS A RELATION AT LEAST AS STRONG AS THE ONE YOU GIVE. You cannot
    hand out access you do not hold. The refusal names the relation you have, or
    says you have none — read that half of the message, it is the diagnosis.
  • THE FIX IS A RELATION, NOT A ROLE. Have someone who already holds owner on
    the resource grant you one; changing your organization role does nothing.

RESOURCE IDS ARE VERSION-4 UUIDs, checked for more than their shape. A
hand-written 8-4-4-4-12 string with tidy digits is refused as an invalid UUID
even though it looks right — copy the id from the resource's own list command.

GRANTS ARE INDEXED BY RESOURCE, AND ONLY BY RESOURCE. Every read here starts
from a resource you already name — "permissions access <type> <id>". There is
no subject-side read, so "what does this user, group or API key reach?" has no
answer in this namespace and is not a command you have failed to find. Answering
it means walking the resources yourself, one "permissions access" per id.
The nearest thing that does exist is scoped to roles rather than to grants:
"nexus role systems" and "nexus role coverage" read outward from a role.`
  );

  // ── access ────────────────────────────────────────────────────────────
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
    .addHelpText(
      "after",
      `
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
  404 — the same 404 as an id that exists nowhere, so it discloses nothing.`
    )
    .action(async (resourceType: string, resourceId: string) => {
      try {
        if (!isPermissionResourceType(resourceType)) {
          throw new Error(
            `Invalid resource type "${resourceType}". Expected one of: ${RESOURCE_TYPE_NAMES}.`
          );
        }
        const client = createClient(program.optsWithGlobals());
        const result = await client.permissions.listResourceAccess(resourceType, resourceId);

        // ONE document under --json. `printList` short-circuits to its own
        // `console.log(JSON.stringify(...))`, so printing the rows and then the
        // reach would emit two concatenated documents: `JSON.parse` throws and a
        // script reading the stream silently keeps only the first — which is the
        // rows without the field that says what they omit.
        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        printList(result.permissions, undefined, [
          { key: "subjectType", label: "SUBJECT TYPE", width: 14 },
          { key: "subjectId", label: "SUBJECT ID", width: 36 },
          { key: "relation", label: "RELATION", width: 10 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
        console.log(describeUnlistedReach(result.unlistedReach));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── grant ─────────────────────────────────────────────────────────────
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
    .addHelpText(
      "after",
      `
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
  operation here that does turn on your organization role.`
    )
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

  // ── revoke ────────────────────────────────────────────────────────────
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
    .addHelpText(
      "after",
      `
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
  removed, and it is the number to compare against what you meant to revoke.`
    )
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

  // ── org-settings ──────────────────────────────────────────────────────
  permissions
    .command("org-settings")
    .description("Read the organization's resource visibility settings")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus permissions org-settings
  $ nexus permissions org-settings --json

Notes:
  Assert on the effective map. vibe_app and access_card are pinned CLOSED by
  the system, so a stored override on either changes nothing.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const settings = await client.permissions.getOrgSettings();
        printRecord(settings, [
          { key: "defaultResourceVisibility", label: "Default" },
          {
            key: "effectiveVisibilityByType",
            label: "Effective",
            format: () => formatVisibilityMap(settings.effectiveVisibilityByType)
          },
          {
            key: "resourceVisibilityByType",
            label: "Stored overrides",
            format: () => formatVisibilityMap(settings.resourceVisibilityByType)
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── set-visibility ────────────────────────────────────────────────────
  const setVisibility = permissions
    .command("set-visibility")
    .description("Set or clear the org's visibility override for one resource type")
    // The list this offers is SHORTER than `permissions grant`'s, and that is
    // the contract's own doing rather than a narrowing declared here:
    // access_card and vibe_app are pinned by the system, and the visibility
    // schema already leaves them out.
    .addOption(
      enumOption(
        "--resource-type <type>",
        "Resource type — access_card and vibe_app are pinned by the system and are not offered",
        PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY__BODY_RESOURCE_TYPE
      ).makeOptionMandatory()
    )
    .addOption(
      enumOption(
        "--visibility <value>",
        "Visibility to set",
        PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY__BODY_VISIBILITY,
        {
          alsoAccepts: ["none"],
          because:
            "'none' is this CLI's own token for clearing the override; the wire value is null, " +
            "and omitting the field is refused, so 'clear it' has to be sayable"
        }
      ).makeOptionMandatory()
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus permissions set-visibility --resource-type agent --visibility closed
  $ nexus permissions set-visibility --resource-type agent --visibility none

Notes:
  "none" clears the override so the type falls back to the org default.
  vibe_app and access_card are pinned by the system and are refused here.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          resourceType: opts.resourceType,
          visibility: resolveVisibility(String(opts.visibility))
        });
        const settings = await client.permissions.updateResourceTypeVisibility(
          asRequestBody<UpdateResourceTypeVisibilityBody>(body)
        );
        printSuccess("Visibility updated.", {
          effective: formatVisibilityMap(settings.effectiveVisibilityByType)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(access, PERMISSIONS_LIST_RESOURCE_ACCESS_CONTRACT);
  bindCommand(grant, PERMISSIONS_GRANT_CONTRACT);
  bindCommand(revoke, PERMISSIONS_REVOKE_CONTRACT);
  bindCommand(setVisibility, PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY_CONTRACT);
}
