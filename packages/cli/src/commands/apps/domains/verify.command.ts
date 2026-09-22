import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type VerifyVibeAppDomainResponse } from "../../../vibe-domain-wire-types";
import { printDomainVerified } from "../_shared/print-domain-verified";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps domains verify` */
export function registerAppsDomainsVerifyCommand(domains: Command, program: Command): Command {
  const leaf = domains
    .command("verify <appId> <host>")
    .description("Check a custom domain's DNS now instead of waiting for the next sweep")
    .addHelpText(
      "after",
      `
Notes:
A domain whose DNS points at the edge moves to ISSUING_CERT, then ACTIVE on
its own. One that does not stays where it is, with the reason printed and the
records it still needs.

Exits 0 whenever the check RAN, whatever it found — read the status, not the
exit code. DNS changes can take minutes to hours to reach every resolver.

Examples:
  $ nexus apps domains verify 11111111-2222-4333-8444-555555555555 shop.acme.com
  $ nexus apps domains verify 11111111-2222-4333-8444-555555555555 shop.acme.com --json | jq -r '.domain.status'
`
    )
    .action(async (appId: string, host: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<VerifyVibeAppDomainResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/domains/${encodeURIComponent(host)}/verify`
        });
        printDomainVerified(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
