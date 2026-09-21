import type { Command } from "commander";

import { runUseOrg } from "./use-org.handler";

const USE_ORG_HELP = `
Examples:
  $ nexus auth use-org org_abc123

Notes:
  Personal tokens act on one organization at a time, selected with the
  organization-id header. This sets the active org for the resolved profile
  without re-authenticating. Verifies you are a member first.`;

/** `nexus auth use-org` */
export function registerAuthUseOrgCommand(auth: Command, program: Command): Command {
  const leaf = auth
    .command("use-org")
    .description("Switch the active organization for a personal (cross-org) token")
    .argument("<orgId>", "Organization ID to activate (see: nexus auth orgs)")
    .addHelpText("after", USE_ORG_HELP)
    .action(async (orgId: string) => {
      await runUseOrg(orgId, program);
    });
  return leaf;
}
