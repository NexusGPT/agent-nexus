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
  // No next step for a status this binary does not list: it cannot say which applies.
  if (domain.dns.status === "ready") {
    console.log("");
    console.log(
      `Next: once the record resolves, run  nexus apps domains verify ${domain.appId} ${domain.host}`
    );
  } else if (domain.dns.status === "unavailable") {
    console.log("");
    console.log(
      `Next: run  nexus apps domains list ${domain.appId}  later — the records appear there once they can be given.`
    );
  }
}
