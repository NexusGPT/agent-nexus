import type { Command } from "commander";

import { handleError } from "../../../errors";
import { EXIT_CODES } from "../../../exit-codes";
import { color, isJsonMode } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { tenantRequest } from "../../../util/tenant-http";
import { type DeletedIdResponse } from "../../../vibe-wire-types";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps delete` */
export function registerAppsDeleteCommand(apps: Command, program: Command): Command {
  const leaf = confirmable(apps.command("delete <appId>"))
    .description("Delete a Vibe app and stop serving it")
    .addHelpText(
      "after",
      `
Notes:
The app is soft-deleted: it drops out of "app list" and out of the console at
once, and its access grants are removed so they cannot outlive it. The name is
released, so you can create a new app with the same name afterwards.

The app's git project is NOT deleted — a project can back several apps, so it
outlives any one of them. Remove it separately with "git-project delete" if
nothing else needs it.

🚨 THE APP'S ENVIRONMENT VARIABLES GO WITH IT, AND THEY ARE NOT IN THE GIT
PROJECT. "apps env" is a sibling namespace, so it is easy to assume its rows
survive alongside the code; they do not. Every plaintext var and every imported
access card on this app becomes unreachable the moment it is deleted, and
re-creating an app with the same name does not bring them back. Copy them out
first — "nexus apps env list <appId> --json" — if you might rebuild this app.

Examples:
  $ nexus apps delete 11111111-2222-4333-8444-555555555555
  $ nexus apps delete 11111111-2222-4333-8444-555555555555 --yes
`
    )
    .action(async (appId: string, cmdOpts: { yes?: boolean }) => {
      try {
        const ok = await confirmDestructive(`Delete app ${appId}? It will stop being served.`, {
          ...cmdOpts,
          rerun: `nexus apps delete ${appId} --yes`
        });
        if (!ok) {
          // ??=, NOT =. `confirmDestructive` ALREADY set the code when it
          // refused for want of a terminal, and a bare assignment here
          // overwrote that category with the generic failure. The other way it
          // returns false is a person typing "n", which sets nothing — so this
          // supplies a code for the abort and never clobbers a refusal's.
          process.exitCode ??= EXIT_CODES.failed;
          return;
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<DeletedIdResponse>(opts, {
          method: "DELETE",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}`
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(`${color.green("✓")} Deleted app ${data.deletedId}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
