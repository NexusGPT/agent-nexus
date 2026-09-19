import type { Command } from "commander";

import { handleError } from "../../../errors";
import { EXIT_CODES } from "../../../exit-codes";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { tenantRequest } from "../../../util/tenant-http";
import { type RotateEdgeTokenResponse } from "../../../vibe-wire-types";
import { printEdgeToken } from "../_shared/print-edge-token";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps rotate-edge-token` */
export function registerAppsRotateEdgeTokenCommand(apps: Command, program: Command): Command {
  const leaf = confirmable(apps.command("rotate-edge-token <appId>"))
    .description("Mint a fresh edge token for a private app and retire the old one")
    .addHelpText(
      "after",
      `
Notes:
Rotation is immediate and there is no grace period: the moment it returns, every
caller still sending the previous token is refused at the edge. Rotate when a
token has leaked, or on whatever schedule you keep — but hand the new one out
first if callers depend on it.

If the app is registered as an agent tool, the tool holds a copy of the old
token and must be re-registered. The command says so when that applies.

Examples:
  $ nexus apps rotate-edge-token 11111111-2222-4333-8444-555555555555
  $ nexus apps rotate-edge-token 11111111-2222-4333-8444-555555555555 --yes
`
    )
    .action(async (appId: string, cmdOpts: { yes?: boolean }) => {
      try {
        const ok = await confirmDestructive(
          `Rotate the edge token for ${appId}? Callers using the current token stop working immediately.`,
          { ...cmdOpts, rerun: `nexus apps rotate-edge-token ${appId} --yes` }
        );
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
        const data = await tenantRequest<RotateEdgeTokenResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/edge-token/rotate`
        });

        printEdgeToken(data.edgeToken, data.toolResyncRequired);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
