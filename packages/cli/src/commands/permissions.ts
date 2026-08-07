import type {
  GrantPermissionBody,
  PermissionResourceType,
  ResourceVisibility,
  RevokePermissionBody,
  UpdateResourceTypeVisibilityBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { parseIdList } from "../util/ids";

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

  // ── access ────────────────────────────────────────────────────────────
  permissions
    .command("access")
    .description("List every grant written against one resource")
    .argument("<resource-type>", `Resource type (${RESOURCE_TYPE_NAMES})`)
    .argument("<resource-id>", "Resource UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus permissions access agent 11111111-1111-1111-1111-111111111111
  $ nexus permissions access workflow 2222... --json`
    )
    .action(async (resourceType: string, resourceId: string) => {
      try {
        if (!isPermissionResourceType(resourceType)) {
          throw new Error(
            `Invalid resource type "${resourceType}". Expected one of: ${RESOURCE_TYPE_NAMES}.`
          );
        }
        const client = createClient(program.optsWithGlobals());
        const { permissions: grants } = await client.permissions.listResourceAccess(
          resourceType,
          resourceId
        );
        printList(grants, undefined, [
          { key: "subjectType", label: "SUBJECT TYPE", width: 14 },
          { key: "subjectId", label: "SUBJECT ID", width: 36 },
          { key: "relation", label: "RELATION", width: 10 },
          { key: "createdAt", label: "CREATED", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── grant ─────────────────────────────────────────────────────────────
  permissions
    .command("grant")
    .description("Grant a principal a relation on a resource")
    .requiredOption("--resource-type <type>", `Resource type (${RESOURCE_TYPE_NAMES})`)
    .requiredOption("--resource-id <id>", "Resource UUID")
    .requiredOption(
      "--subject-type <type>",
      "Subject type (user, group, organization, api_key, role)"
    )
    .requiredOption("--subject-id <id>", "Subject ID — user id, group UUID, org id, or API key id")
    .requiredOption("--relation <relation>", "Relation to grant (owner, editor, viewer)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus permissions grant --resource-type agent --resource-id 1111... \\
      --subject-type group --subject-id 2222... --relation viewer`
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
  permissions
    .command("revoke")
    .description("Revoke a principal's grant on a resource")
    .requiredOption("--resource-type <type>", `Resource type (${RESOURCE_TYPE_NAMES})`)
    .requiredOption("--resource-id <id>", "Resource UUID, or '*' to target a wildcard grant")
    .requiredOption(
      "--subject-type <type>",
      "Subject type (user, group, organization, api_key, role)"
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
  naming an unrelated subject removes nothing.`
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
  permissions
    .command("set-visibility")
    .description("Set or clear the org's visibility override for one resource type")
    .requiredOption("--resource-type <type>", `Resource type (${RESOURCE_TYPE_NAMES})`)
    .requiredOption("--visibility <value>", "open, closed, or none to clear the override")
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
}
