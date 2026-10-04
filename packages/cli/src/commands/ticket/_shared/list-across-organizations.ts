import type { ListTicketsParams, NexusClient } from "@agent-nexus/sdk";

import { color, printList } from "../../../output";

/**
 * Renders the owning organization of a cross-org ticket. The API sends
 * `organizationName: null` for an org that has never been named, so the column
 * falls back to a dash rather than printing the word "null". The
 * `organizationId` is always present in `--json` output when the name is not
 * enough to tell two orgs apart.
 */
function formatOrganizationName(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "—";
}

/**
 * Report the organizations whose fetch failed, on STDERR.
 *
 * Aggregation is best-effort: the API skips an org it could not read rather
 * than failing the whole request. Left unsaid, that turns a partial answer into
 * a confident "no such ticket exists" — the exact false negative this command
 * exists to remove. STDERR keeps `--json` output on STDOUT parseable, and the
 * ids also travel inside that JSON's `meta` for a scripted caller.
 */
function warnAboutSkippedOrganizations(skippedOrganizationIds: readonly string[]): void {
  if (skippedOrganizationIds.length === 0) return;

  console.error(
    color.yellow("Warning:") +
      ` ${skippedOrganizationIds.length} organization(s) could not be read and were skipped, ` +
      "so this list is incomplete: " +
      skippedOrganizationIds.join(", ")
  );
}

/**
 * List tickets from EVERY organization the caller belongs to, instead of only
 * the profile's active org.
 *
 * The same NEX-* Linear team backs every org, so a ticket filed under one org
 * profile was invisible from another — which made "search before you file"
 * unreliable and duplicated tickets. Cross-org aggregation needs a personal
 * (cross-org) token: an org-scoped key reaches exactly one org by construction,
 * and the API answers it with a 403 rather than a silently single-org list.
 */
export async function listAcrossOrganizations(
  client: NexusClient,
  params: ListTicketsParams
): Promise<void> {
  const result = await client.tickets.listAcrossOrganizations(params);

  printList(
    result.tickets,
    {
      ...result.meta,
      organizationCount: result.organizationCount,
      skippedOrganizationIds: result.skippedOrganizationIds
    },
    [
      { key: "identifier", label: "IDENTIFIER", width: 12 },
      { key: "organizationName", label: "ORG", width: 20, format: formatOrganizationName },
      { key: "title", label: "TITLE", width: 32 },
      { key: "type", label: "TYPE", width: 18 },
      { key: "priority", label: "PRIORITY", width: 10 },
      { key: "status", label: "STATUS", width: 15 }
    ]
  );

  warnAboutSkippedOrganizations(result.skippedOrganizationIds);
}
