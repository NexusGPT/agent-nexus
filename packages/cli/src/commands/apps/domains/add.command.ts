import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type AddVibeAppDomainResponse } from "../../../vibe-domain-wire-types";
import { printDomainAdded } from "../_shared/print-domain-added";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps domains add` */
export function registerAppsDomainsAddCommand(domains: Command, program: Command): Command {
  const leaf = domains
    .command("add <appId> <host>")
    .description("Attach a host you own to an app, and print the DNS records to create")
    .addHelpText(
      "after",
      `
Notes:
Prints a Type / Name / Value table to copy into your DNS provider, whichever
provider that is. Name is always the FULL host, never "@" or a relative label.

  a SUBDOMAIN (shop.acme.com) gets ONE CNAME.
  an APEX     (acme.com)      gets A records — an apex cannot carry a CNAME.

⚠️ AN APEX CAN COME BACK WITH NO RECORDS AT ALL, AND THAT IS NOT A FAILURE. It
means this platform's edge addresses are not configured yet. The domain is
still attached; the reason is printed instead of an address, and
"apps domains list" shows the records once they exist. Never point an apex at
an address you did not get from this command.

The server normalises the host (lowercase, punycode, trailing dot dropped).
Refused:
  400  not a host an app can be served on — an IP, a wildcard, a public
       suffix, anything under a platform domain
  409  the host is already attached to an app. The holder is never named.

Examples:
  $ nexus apps domains add 11111111-2222-4333-8444-555555555555 shop.acme.com
  $ nexus apps domains add 11111111-2222-4333-8444-555555555555 acme.com --json | jq '.domain.dns'
`
    )
    .action(async (appId: string, host: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<AddVibeAppDomainResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/domains`,
          body: { host }
        });
        printDomainAdded(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
