import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type ListVibeAppsResponse } from "../../../vibe-wire-types";
import { printVibeAppList } from "../_shared/print-vibe-app-list";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps list` */
export function registerAppsListCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("list")
    .description("List the org's Vibe apps, newest-first")
    .addHelpText(
      "after",
      `
Notes:
THIS IS WHERE THE APP ID COMES FROM, which is why the Id column is never
truncated: every other "apps" verb takes that id as an argument.

The Source column earns its place by separating the two apps that look
identical in every other column — the app nobody has pushed to yet, and the app
that has no source to push to at all. "apps get" has room for the fix.

Approvals reads "required" or "off" and is the gate "apps approvals" works on.
An app with no deployments yet still lists here.

An org with no apps prints one dim line; --json returns the payload either way.

Examples:
  $ nexus apps list
  $ nexus apps list --json
`
    )
    .action(async () => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListVibeAppsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/apps"
        });
        printVibeAppList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
