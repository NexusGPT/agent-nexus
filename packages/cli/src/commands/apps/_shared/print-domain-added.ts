import { color, isJsonMode } from "../../../output";
import { type AddVibeAppDomainResponse } from "../../../vibe-domain-wire-types";
import { colorizeDomainStatus } from "./colorize-domain-status";
import { printDomainDnsInstructions } from "./print-domain-dns-instructions";

/** `apps domains add`: the domain, the records to create, and the one next step. */
export function printDomainAdded(data: AddVibeAppDomainResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const { domain } = data;
  console.log(
    `${color.green("✓")} Added ${domain.host} (${domain.kind}) — ${colorizeDomainStatus(domain.status)}`
  );
  console.log("");
  printDomainDnsInstructions(domain.dns);
  console.log("");
  console.log(
    domain.dns.status === "ready"
      ? `Next: once the record resolves, run  nexus apps domains verify ${domain.appId} ${domain.host}`
      : `Next: run  nexus apps domains list ${domain.appId}  later — the records appear there once they can be given.`
  );
}
