import type { Command } from "commander";

import { resolveBaseUrl, resolveProfile } from "../../config";
import { reportFailure } from "../../errors";
import { color, isJsonMode } from "../../output";
import { fetchOrganizations, type UserOrganization } from "./_shared/fetch-organizations";
import { renderOrganizations } from "./orgs.render";

const ORGS_HELP = `
Examples:
  $ nexus auth orgs

Notes:
  For a personal (cross-org) token, lists every organization you belong to and
  marks the active one (▸). Switch with "nexus auth use-org <orgId>".`;

/** `nexus auth orgs` */
export function registerAuthOrgsCommand(auth: Command, program: Command): Command {
  const leaf = auth
    .command("orgs")
    .description("List the organizations the active token can act on")
    .addHelpText("after", ORGS_HELP)
    .action(async () => {
      const globals = program.optsWithGlobals();
      let resolved;
      try {
        resolved = resolveProfile(globals);
      } catch {
        process.exitCode = reportFailure(
          "not-authenticated",
          "Not logged in.",
          "Run: nexus auth login"
        );
        return;
      }

      const baseUrl = resolved.profile.baseUrl ?? resolveBaseUrl();
      let organizations: UserOrganization[];
      try {
        organizations = await fetchOrganizations(baseUrl, resolved.profile.apiKey);
      } catch (err) {
        process.exitCode = reportFailure("connection-failed", (err as Error).message);
        return;
      }

      // A platform-operator profile can be pointed at an org OUTSIDE the owner's
      // memberships, and /me/organizations only ever returns memberships. Without
      // this the active tenant simply would not appear — no row carries the ▸ —
      // and the operator has no way to confirm from the CLI which org they are
      // acting on, which is the one thing this command exists to answer.
      const activeOrgId = resolved.profile.orgId;
      const activeIsForeign =
        activeOrgId !== undefined && !organizations.some((o) => o.organizationId === activeOrgId);

      if (organizations.length === 0 && !activeIsForeign && !isJsonMode()) {
        console.log(color.dim("No organizations found for this token."));
        return;
      }

      const listed: UserOrganization[] = activeIsForeign
        ? [
            {
              organizationId: activeOrgId,
              // Whatever was captured at login/switch. Hardcoding null here threw
              // away a name we may well have.
              name: resolved.profile.orgName ?? null,
              role: "platform-operator"
            },
            ...organizations
          ]
        : organizations;

      renderOrganizations(listed, activeOrgId, activeIsForeign);
    });
  return leaf;
}
