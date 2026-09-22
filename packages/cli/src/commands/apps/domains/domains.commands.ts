import type { Command } from "commander";

import { registerAppsDomainsAddCommand } from "./add.command";
import { registerAppsDomainsListCommand } from "./list.command";
import { registerAppsDomainsPrimaryCommand } from "./primary.command";
import { registerAppsDomainsRemoveCommand } from "./remove.command";
import { registerAppsDomainsVerifyCommand } from "./verify.command";

const DOMAINS_HELP = `
Serve an app on a host you own, beside its platform host.

  1. apps domains add <appId> <host>      prints the DNS record(s) to create
  2. create them at your DNS provider — any provider works
  3. apps domains verify <appId> <host>   checks now instead of waiting
  4. apps domains primary <appId> <host>  once ACTIVE, make it canonical

WHICH RECORD DEPENDS ON THE HOST, AND "add" PRINTS THE EXACT ONE:
  a subdomain (shop.acme.com)  one CNAME to the custom-domain edge
  an apex     (acme.com)       A records — an apex cannot carry a CNAME. Some
                               providers offer CNAME flattening / ALIAS at the
                               apex; the A records work everywhere.

Statuses: PENDING_DNS → ISSUING_CERT → ACTIVE, or FAILED with a reason.
`;

/** Registers every `nexus apps domains` leaf, in the order a person runs them. */
export function registerAppsDomainsCommands(apps: Command, program: Command): void {
  const domains = apps
    .command("domains")
    .description("Attach custom domains to an app — add, list, verify, primary, remove")
    .addHelpText("after", DOMAINS_HELP);

  registerAppsDomainsAddCommand(domains, program);
  registerAppsDomainsListCommand(domains, program);
  registerAppsDomainsVerifyCommand(domains, program);
  registerAppsDomainsPrimaryCommand(domains, program);
  registerAppsDomainsRemoveCommand(domains, program);
}
