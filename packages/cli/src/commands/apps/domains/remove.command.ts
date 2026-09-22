import type { Command } from "commander";

import { handleError } from "../../../errors";
import { EXIT_CODES } from "../../../exit-codes";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { tenantRequest } from "../../../util/tenant-http";
import { type DeleteVibeAppDomainResponse } from "../../../vibe-domain-wire-types";
import { printDomainRemoved } from "../_shared/print-domain-removed";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps domains remove` */
export function registerAppsDomainsRemoveCommand(domains: Command, program: Command): Command {
  const leaf = confirmable(domains.command("remove <appId> <host>"))
    .alias("rm")
    .description("Detach a custom domain from an app")
    .addHelpText(
      "after",
      `
Notes:
The app stops answering on that host at once, and the host is freed for any
app — in any organization — to claim. Your DNS records are not touched; remove
them at your provider if nothing else should use them.

Examples:
  $ nexus apps domains remove 11111111-2222-4333-8444-555555555555 shop.acme.com
  $ nexus apps domains rm 11111111-2222-4333-8444-555555555555 shop.acme.com --yes
`
    )
    .action(async (appId: string, host: string, cmdOpts: { yes?: boolean }) => {
      try {
        const ok = await confirmDestructive(`Detach ${host}? The app stops being served on it.`, {
          ...cmdOpts,
          rerun: `nexus apps domains remove ${appId} ${host} --yes`
        });
        if (!ok) {
          // ??= keeps the category confirmDestructive already set when it
          // refused for want of a terminal; a typed "n" set nothing.
          process.exitCode ??= EXIT_CODES.failed;
          return;
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<DeleteVibeAppDomainResponse>(opts, {
          method: "DELETE",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/domains/${encodeURIComponent(host)}`
        });
        printDomainRemoved(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
