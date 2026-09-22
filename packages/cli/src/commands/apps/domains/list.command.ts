import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type ListVibeAppDomainsResponse } from "../../../vibe-domain-wire-types";
import { printDomainList } from "../_shared/print-domain-list";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps domains list` */
export function registerAppsDomainsListCommand(domains: Command, program: Command): Command {
  const leaf = domains
    .command("list <appId>")
    .description("List an app's custom domains: host, status, primary, and why")
    .addHelpText(
      "after",
      `
Notes:
The Reason column is what the last DNS check found — read it when a domain
sits in PENDING_DNS or FAILED. The table does not repeat the records; --json
carries each domain's "dns" instructions in full.

Examples:
  $ nexus apps domains list 11111111-2222-4333-8444-555555555555
  $ nexus apps domains list 11111111-2222-4333-8444-555555555555 --json | jq '.domains[] | {host, dns}'
`
    )
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<ListVibeAppDomainsResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/domains`
        });
        printDomainList(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
