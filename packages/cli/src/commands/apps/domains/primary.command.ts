import type { Command } from "commander";

import { handleError, refuse } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type SetVibeAppPrimaryDomainResponse } from "../../../vibe-domain-wire-types";
import { printPrimaryDomain } from "../_shared/print-primary-domain";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps domains primary` */
export function registerAppsDomainsPrimaryCommand(domains: Command, program: Command): Command {
  const leaf = domains
    .command("primary <appId> [host]")
    .description("Make an ACTIVE custom domain the app's canonical host, or --clear it")
    .option("--clear", "Clear the primary: the platform host is canonical again")
    .addHelpText(
      "after",
      `
Notes:
Exactly one of <host> or --clear. Only an ACTIVE domain of this app can be
primary — "apps domains list" shows which are.

The host is sent as you typed it and the server decides what it names, with
the same rules that stored it: any spelling of an attached host works
(Shop.Acme.COM., an IDN), a string that is not a host is refused (400), and a
host that is not a domain of this app is not found (404).

Examples:
  $ nexus apps domains primary 11111111-2222-4333-8444-555555555555 shop.acme.com
  $ nexus apps domains primary 11111111-2222-4333-8444-555555555555 --clear
`
    )
    .action(async (appId: string, host: string | undefined, cmdOpts: { clear?: boolean }) => {
      try {
        if ((host === undefined) === (cmdOpts.clear !== true)) {
          process.exitCode = refuse(
            "Give a host or --clear, not both and not neither.",
            `Run "nexus apps domains primary --help" for the full usage.`
          );
          return;
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<SetVibeAppPrimaryDomainResponse>(opts, {
          method: "PUT",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/primary-domain`,
          // The host goes over as typed, trimmed of the whitespace a shell or a
          // paste adds. What it names is the server's decision, not this binary's.
          body: host === undefined ? { domainId: null } : { host: host.trim() }
        });
        printPrimaryDomain(data, host === undefined ? null : host.trim());
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
